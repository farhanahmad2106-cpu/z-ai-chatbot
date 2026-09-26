import sys
import os
import asyncio
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, patch, MagicMock
import pytest

backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend"))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from backend.middleware.quota_check import IST
from backend.services.quota_worker import MonthlyQuotaRolloverService, quota_rollover_worker_loop

class MockAsyncCursor:
    def __init__(self, docs):
        self.docs = docs
        self.idx = 0
    
    def limit(self, length):
        self.docs = self.docs[:length]
        return self
        
    def __aiter__(self):
        return self
        
    async def __anext__(self):
        if self.idx < len(self.docs):
            doc = self.docs[self.idx]
            self.idx += 1
            return doc
        raise StopAsyncIteration

class MockAsyncCollection:
    def __init__(self, initial_docs=None):
        self.docs = [dict(d) for d in (initial_docs or [])]
        self._lock = asyncio.Lock()

    def _matches(self, doc, query):
        if not query:
            return True
        for k, v in query.items():
            if k == "$or":
                if not any(self._matches(doc, q) for q in v):
                    return False
                continue
            if "." in k:
                parts = k.split(".")
                val = doc
                for p in parts:
                    if isinstance(val, dict) and p in val:
                        val = val[p]
                    else:
                        val = None
                        break
            else:
                val = doc.get(k)

            if isinstance(v, dict):
                if "$ne" in v:
                    if val == v["$ne"] or (isinstance(val, list) and v["$ne"] in val):
                        return False
                if "$in" in v:
                    if val not in v["$in"]:
                        return False
                if "$lte" in v:
                    if val is None or val > v["$lte"]:
                        return False
                if "$lt" in v:
                    if val is None or val >= v["$lt"]:
                        return False
                if "$exists" in v:
                    exists = val is not None
                    if exists != v["$exists"]:
                        return False
            elif isinstance(val, list):
                if v not in val:
                    return False
            else:
                if val != v:
                    return False
        return True

    def _set_nested(self, doc, key, val):
        parts = key.split(".")
        target = doc
        for p in parts[:-1]:
            if target.get(p) is None or not isinstance(target.get(p), dict):
                target[p] = {}
            target = target[p]
        target[parts[-1]] = val

    def find(self, query, projection=None):
        results = []
        for doc in self.docs:
            if self._matches(doc, query):
                if projection:
                    res = {}
                    for k in projection:
                        if k in doc:
                            res[k] = doc[k]
                    results.append(res)
                else:
                    results.append(dict(doc))
        return MockAsyncCursor(results)

    async def update_many(self, query, update):
        async with self._lock:
            modified = 0
            for i, doc in enumerate(self.docs):
                if self._matches(doc, query):
                    if "$set" in update:
                        for k, v in update["$set"].items():
                            self._set_nested(doc, k, v)
                    self.docs[i] = doc
                    modified += 1
            return MagicMock(modified_count=modified)

@pytest.fixture
def mock_collection():
    return MockAsyncCollection([
        {
            "_id": "user1",
            "usage": {
                "scan_period": "2026-08",
                "scans_used_this_month": 45
            }
        },
        {
            "_id": "user2",
            "usage": {
                "scan_period": "2026-09",
                "scans_used_this_month": 5
            }
        },
        {
            "_id": "user3"
            # No usage state
        },
        {
            "_id": "user4",
            "usage": {
                "scans_used_this_month": 20
                # No scan_period
            }
        }
    ])


@pytest.mark.asyncio
async def test_rollover_previous_month(mock_collection):
    service = MonthlyQuotaRolloverService(mock_collection)
    now = datetime(2026, 9, 1, 0, 0, 5, tzinfo=IST)
    await service.execute_batch_rollover(now=now)

    u1 = next(d for d in mock_collection.docs if d["_id"] == "user1")
    assert u1["usage"]["scans_used_this_month"] == 0
    assert u1["usage"]["scan_period"] == "2026-09"
    assert u1["usage"]["reset_date"] == "2026-10-01"

@pytest.mark.asyncio
async def test_rollover_current_month_ignored(mock_collection):
    service = MonthlyQuotaRolloverService(mock_collection)
    now = datetime(2026, 9, 1, 0, 0, 5, tzinfo=IST)
    await service.execute_batch_rollover(now=now)

    u2 = next(d for d in mock_collection.docs if d["_id"] == "user2")
    assert u2["usage"]["scans_used_this_month"] == 5
    assert u2["usage"]["scan_period"] == "2026-09"

@pytest.mark.asyncio
async def test_rollover_missing_usage(mock_collection):
    service = MonthlyQuotaRolloverService(mock_collection)
    now = datetime(2026, 9, 1, 0, 0, 5, tzinfo=IST)
    await service.execute_batch_rollover(now=now)

    u3 = next(d for d in mock_collection.docs if d["_id"] == "user3")
    assert u3["usage"]["scans_used_this_month"] == 0
    assert u3["usage"]["scan_period"] == "2026-09"
    assert u3["usage"]["reset_date"] == "2026-10-01"
    
@pytest.mark.asyncio
async def test_rollover_missing_scan_period(mock_collection):
    service = MonthlyQuotaRolloverService(mock_collection)
    now = datetime(2026, 9, 1, 0, 0, 5, tzinfo=IST)
    await service.execute_batch_rollover(now=now)

    u4 = next(d for d in mock_collection.docs if d["_id"] == "user4")
    assert u4["usage"]["scans_used_this_month"] == 0
    assert u4["usage"]["scan_period"] == "2026-09"
    assert u4["usage"]["reset_date"] == "2026-10-01"

@pytest.mark.asyncio
async def test_december_january_transition():
    col = MockAsyncCollection([
        {"_id": "u1", "usage": {"scan_period": "2026-12", "scans_used_this_month": 10}}
    ])
    service = MonthlyQuotaRolloverService(col)
    
    now_dec = datetime(2026, 12, 31, 23, 59, 59, tzinfo=IST)
    await service.execute_batch_rollover(now=now_dec)
    
    # It should become 2026-12 period for anyone not on 2026-12
    # Our user is already 2026-12, so no change
    u1 = next(d for d in col.docs if d["_id"] == "u1")
    assert u1["usage"]["scans_used_this_month"] == 10
    
    now_jan = datetime(2027, 1, 1, 0, 0, 1, tzinfo=IST)
    await service.execute_batch_rollover(now=now_jan)
    
    u1 = next(d for d in col.docs if d["_id"] == "u1")
    assert u1["usage"]["scans_used_this_month"] == 0
    assert u1["usage"]["scan_period"] == "2027-01"
    assert u1["usage"]["reset_date"] == "2027-02-01"

@pytest.mark.asyncio
async def test_leap_year():
    col = MockAsyncCollection([
        {"_id": "u1", "usage": {"scan_period": "2028-01", "scans_used_this_month": 10}}
    ])
    service = MonthlyQuotaRolloverService(col)
    
    now_feb = datetime(2028, 2, 1, 0, 0, 1, tzinfo=IST)
    await service.execute_batch_rollover(now=now_feb)
    
    u1 = next(d for d in col.docs if d["_id"] == "u1")
    assert u1["usage"]["scan_period"] == "2028-02"
    assert u1["usage"]["reset_date"] == "2028-03-01"

@pytest.mark.asyncio
async def test_midnight_sleep_calculation():
    from backend.services.quota_worker import seconds_until_next_ist_midnight
    
    now = datetime(2026, 9, 30, 23, 59, 59, tzinfo=IST)
    sleep_sec = seconds_until_next_ist_midnight(now)
    assert abs(sleep_sec - 1.0) < 0.1
    
    now2 = datetime(2026, 10, 1, 0, 0, 0, tzinfo=IST)
    sleep_sec2 = seconds_until_next_ist_midnight(now2)
    assert abs(sleep_sec2 - 86400.0) < 0.1

@pytest.mark.asyncio
async def test_idempotency(mock_collection):
    service = MonthlyQuotaRolloverService(mock_collection)
    now = datetime(2026, 9, 1, 0, 0, 5, tzinfo=IST)
    
    res1 = await service.execute_batch_rollover(now=now)
    assert res1 == 3
    
    res2 = await service.execute_batch_rollover(now=now)
    assert res2 == 0
    
    res3 = await service.execute_batch_rollover(now=now)
    assert res3 == 0

@pytest.mark.asyncio
async def test_concurrent_rollover_safety(mock_collection):
    service = MonthlyQuotaRolloverService(mock_collection)
    now = datetime(2026, 9, 1, 0, 0, 5, tzinfo=IST)
    
    await asyncio.gather(
        service.execute_batch_rollover(now=now),
        service.execute_batch_rollover(now=now)
    )
    
    # Verify final state is clean and no duplicates
    u1 = next(d for d in mock_collection.docs if d["_id"] == "user1")
    assert u1["usage"]["scans_used_this_month"] == 0
    assert u1["usage"]["scan_period"] == "2026-09"

@pytest.mark.asyncio
async def test_worker_cancellation():
    stop_event = asyncio.Event()
    col = MockAsyncCollection()
    
    task = asyncio.create_task(quota_rollover_worker_loop(col, stop_event))
    
    # Let it start
    await asyncio.sleep(0.1)
    task.cancel()
    
    with pytest.raises(asyncio.CancelledError):
        await task

@pytest.mark.asyncio
async def test_worker_startup_catchup():
    stop_event = asyncio.Event()
    col = MockAsyncCollection([
        {"_id": "user1", "usage": {"scan_period": "2026-08", "scans_used_this_month": 45}}
    ])
    
    task = asyncio.create_task(quota_rollover_worker_loop(col, stop_event))
    
    # Wait for the catch-up to complete and it to go to sleep
    await asyncio.sleep(0.1)
    
    u1 = next(d for d in col.docs if d["_id"] == "user1")
    assert u1["usage"]["scans_used_this_month"] == 0
    
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass

@pytest.mark.asyncio
async def test_mongodb_failure_recovery():
    col = MagicMock()
    col.find.side_effect = Exception("Transient DB Error")
    
    stop_event = asyncio.Event()
    
    with patch("backend.services.quota_worker.asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
        # Make the sleep raise CancelledError so it doesn't loop infinitely if stop_event is not caught
        mock_sleep.side_effect = asyncio.CancelledError()
        
        task = asyncio.create_task(quota_rollover_worker_loop(col, stop_event))
        
        try:
            await task
        except asyncio.CancelledError:
            pass
            
        assert mock_sleep.call_count >= 1

@pytest.mark.asyncio
async def test_exact_ist_boundary():
    from backend.middleware.quota_check import get_current_period
    
    now_utc_before = datetime(2026, 9, 30, 18, 29, 59, tzinfo=timezone.utc)
    period_before = get_current_period(now_utc_before)
    assert period_before == "2026-09"
    
    now_utc_after = datetime(2026, 9, 30, 18, 30, 0, tzinfo=timezone.utc)
    period_after = get_current_period(now_utc_after)
    assert period_after == "2026-10"
