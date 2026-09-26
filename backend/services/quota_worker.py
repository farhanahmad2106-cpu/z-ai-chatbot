import asyncio
import logging
from datetime import datetime, timedelta
from typing import Optional

from middleware.quota_check import get_current_period, get_next_reset_date, IST

logger = logging.getLogger("quota_worker")

def now_ist() -> datetime:
    """Injectable clock for deterministic tests."""
    return datetime.now(IST)

def seconds_until_next_ist_midnight(now: Optional[datetime] = None) -> float:
    """Calculates seconds from now until the next 00:00:00 IST boundary."""
    dt = now or now_ist()
    if dt.tzinfo is None:
        dt = dt.astimezone(IST)
    
    # Calculate next day midnight in IST
    next_day = dt + timedelta(days=1)
    next_midnight = next_day.replace(hour=0, minute=0, second=0, microsecond=0)
    
    return (next_midnight - dt).total_seconds()

class MonthlyQuotaRolloverService:
    def __init__(self, users_collection):
        self.users_collection = users_collection

    async def execute_batch_rollover(
        self,
        chunk_size: int = 500,
        now: Optional[datetime] = None,
    ) -> int:
        """
        Idempotent, batched MongoDB quota rollover.
        Finds users on stale/missing periods and updates them atomically.
        """
        current_period = get_current_period(now)
        next_reset_date = get_next_reset_date(now)
        rollover_timestamp = (now or now_ist()).isoformat()

        total_reset = 0

        while True:
            # Step 1: Find users whose usage.scan_period is stale or missing
            # Only project _id for memory efficiency
            cursor = self.users_collection.find(
                {
                    "$or": [
                        {"usage.scan_period": {"$ne": current_period}},
                        {"usage.scan_period": {"$exists": False}}
                    ]
                },
                {"_id": 1}
            ).limit(chunk_size)

            user_ids = []
            async for doc in cursor:
                user_ids.append(doc["_id"])

            if not user_ids:
                break

            # Step 2: Atomically update this chunk
            # Re-assert the condition to ensure idempotency and concurrency safety
            res = await self.users_collection.update_many(
                {
                    "_id": {"$in": user_ids},
                    "$or": [
                        {"usage.scan_period": {"$ne": current_period}},
                        {"usage.scan_period": {"$exists": False}}
                    ]
                },
                {
                    "$set": {
                        "usage.scans_used_this_month": 0,
                        "usage.scan_period": current_period,
                        "usage.reset_date": next_reset_date,
                        "usage.last_rollover_at": rollover_timestamp
                    }
                }
            )

            total_reset += res.modified_count
            
            # Safety break if we failed to modify anything to avoid infinite loop
            # This happens if all documents in the batch were updated by another worker concurrently
            if res.modified_count == 0 and len(user_ids) > 0:
                # Let's break out of the loop and try again next tick if necessary,
                # or just continue since cursor will fetch next batch naturally?
                # If modified_count is 0, the next find() won't return these IDs anymore, so it's safe to continue.
                pass

        return total_reset

async def quota_rollover_worker_loop(
    users_collection,
    stop_event: Optional[asyncio.Event] = None
) -> None:
    """
    Background worker loop that triggers rollover immediately on startup,
    then sleeps precisely until the next IST midnight boundary.
    """
    service = MonthlyQuotaRolloverService(users_collection)
    
    try:
        while True:
            if stop_event and stop_event.is_set():
                break
                
            start_time = now_ist()
            current_period = get_current_period(start_time)
            
            try:
                # 1. Execute Catch-up / Midnight Rollover
                users_reset = await service.execute_batch_rollover(now=start_time)
                duration_ms = (now_ist() - start_time).total_seconds() * 1000
                
                logger.info(
                    "event=quota_rollover period=%s users_reset=%d duration_ms=%.1f started_at=%s",
                    current_period, users_reset, duration_ms, start_time.isoformat()
                )
            except asyncio.CancelledError:
                raise
            except Exception as e:
                logger.error("event=quota_rollover_failed error=%s", str(e))
                # Transient failure backoff
                await asyncio.sleep(60.0)
                continue

            # 2. Calculate sleep until next IST midnight
            sleep_seconds = seconds_until_next_ist_midnight()
            
            logger.info("event=quota_rollover_sleep sleep_seconds=%.1f", sleep_seconds)
            
            # Wait for sleep_seconds, checking stop_event periodically or using asyncio.wait
            if stop_event:
                try:
                    await asyncio.wait_for(stop_event.wait(), timeout=sleep_seconds)
                    if stop_event.is_set():
                        break
                except asyncio.TimeoutError:
                    pass
            else:
                await asyncio.sleep(sleep_seconds)
                
    except asyncio.CancelledError:
        logger.info("event=quota_rollover_cancelled")
        raise
