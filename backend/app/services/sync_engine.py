# Z-AI Chatbot — LAN Sync & Peer Discovery Engine
from __future__ import annotations
import socket
import logging
import asyncio
from typing import Any
from zeroconf import IPVersion, ServiceInfo, Zeroconf, ServiceBrowser

from app.core.config import get_settings
from app.database.connection import get_db
from app.database.models import AppMetadata, SyncDevice

logger = logging.getLogger(__name__)

class SyncPeerBrowser:
    def __init__(self) -> None:
        self.peers: dict[str, dict[str, Any]] = {}

    def remove_service(self, zeroconf: Zeroconf, type: str, name: str) -> None:
        logger.info("Service %s removed", name)
        if name in self.peers:
            del self.peers[name]

    def update_service(self, zeroconf: Zeroconf, type: str, name: str) -> None:
        pass

    def add_service(self, zeroconf: Zeroconf, type: str, name: str) -> None:
        info = zeroconf.get_service_info(type, name)
        if info:
            addresses = [socket.inet_ntoa(addr) for addr in info.addresses]
            device_id = info.properties.get(b"device_id", b"").decode()
            platform = info.properties.get(b"platform", b"").decode()
            device_name = info.properties.get(b"device_name", b"").decode()
            
            if device_id:
                self.peers[name] = {
                    "device_id": device_id,
                    "device_name": device_name or name.split(".")[0],
                    "platform": platform or "unknown",
                    "ip": addresses[0] if addresses else "127.0.0.1",
                    "port": info.port
                }
                logger.info("Discovered sync peer: %s at %s:%s", device_name, addresses, info.port)

class LANSyncEngine:
    """
    Zeroconf/mDNS Peer Discovery & LAN Synchronization Service
    """
    def __init__(self) -> None:
        self._zeroconf: Zeroconf | None = None
        self._browser: ServiceBrowser | None = None
        self._peer_listener = SyncPeerBrowser()
        self._service_info: ServiceInfo | None = None

    def start_discovery(self) -> None:
        """Registers local service and begins scanning LAN for peers."""
        if self._zeroconf is not None: return

        settings = get_settings()
        self._zeroconf = Zeroconf(ip_version=IPVersion.V4Only)

        # Get local unique device properties
        with get_db() as db:
            meta = db.query(AppMetadata).filter_by(id=1).first()
            device_id = meta.device_id if meta else "unknown_device"

        hostname = socket.gethostname()
        local_ip = socket.gethostbyname(hostname)

        # 1. Advertise this instance
        properties = {
            "device_id": device_id,
            "device_name": f"Z-AI {hostname}",
            "platform": "desktop"
        }

        self._service_info = ServiceInfo(
            "_zai-sync._tcp.local.",
            f"Z-AI-{device_id[:8]}._zai-sync._tcp.local.",
            addresses=[socket.inet_aton(local_ip)],
            port=settings.port,
            properties=properties,
            server=f"Z-AI-{device_id[:8]}.local."
        )

        try:
            self._zeroconf.register_service(self._service_info)
            logger.info("Registered Zeroconf sync service successfully")
        except Exception as e:
            logger.error("Failed to register Zeroconf service: %s", e)

        # 2. Browse for other Z-AI sync peers on the subnet
        self._browser = ServiceBrowser(
            self._zeroconf,
            "_zai-sync._tcp.local.",
            listener=self._peer_listener
        )
        logger.info("LAN Sync discovery started")

    def get_discovered_peers(self) -> list[dict[str, Any]]:
        """Returns all currently scanned active LAN devices."""
        return list(self._peer_listener.peers.values())

    def stop_discovery(self) -> None:
        """Unregisters local service and disposes Zeroconf handles."""
        if self._zeroconf:
            if self._service_info:
                self._zeroconf.unregister_service(self._service_info)
            self._zeroconf.close()
            self._zeroconf = None
            self._browser = None
            self._service_info = None
            logger.info("LAN Sync discovery stopped")

sync_engine = LANSyncEngine()
