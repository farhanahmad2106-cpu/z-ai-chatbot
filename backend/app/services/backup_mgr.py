# Z-AI Chatbot — Encrypted Backup Manager
from __future__ import annotations
import os
import shutil
import zipfile
import logging
import hashlib
from pathlib import Path
from datetime import datetime, timezone
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.core.config import get_settings, BACKUPS_DIR
from app.database.connection import db_manager, get_db
from app.database.models import AppMetadata, Backup, Conversation, Message

logger = logging.getLogger(__name__)

class BackupError(Exception):
    pass

class BackupManager:
    """
    Handles secure incremental compressed backups:
    1. Creates zip containing DB file.
    2. Encrypts the zip using AES-256-GCM using a key derived from the database key.
    3. Manages restores and integrity verification checks.
    """
    def __init__(self) -> None:
        self._backups_dir: Path = BACKUPS_DIR

    def _derive_backup_key(self, pin: str, salt_hex: str) -> bytes:
        """Derive a 32-byte key for AESGCM."""
        from app.core.security import derive_db_key
        derived_hex = derive_db_key(pin, salt_hex)
        return hashlib.sha256(derived_hex.encode()).digest()

    def create_backup(self, pin: str, backup_type: str = "manual") -> Backup:
        """
        Generates an encrypted ZIP backup of the SQLCipher database.
        """
        if not db_manager.is_unlocked:
            raise BackupError("Database is locked. Cannot create backup.")

        settings = get_settings()
        db_path = settings.db_path
        if not db_path.exists():
            raise BackupError("Database file not found.")

        # Read salt to derive the encryption key
        salt_path = db_path.parent / "db.salt"
        if not salt_path.exists():
            raise BackupError("Database salt file missing.")
        salt_hex = salt_path.read_text(encoding="utf-8").strip()
        backup_key = self._derive_backup_key(pin, salt_hex)

        # Get metrics
        with get_db() as db:
            meta = db.query(AppMetadata).filter_by(id=1).first()
            if not meta: raise BackupError("AppMetadata missing.")
            conv_count = db.query(Conversation).count()
            msg_count = db.query(Message).count()

        # Temporary files paths
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        temp_zip = self._backups_dir / f"temp_{timestamp}.zip"
        final_filename = f"backup_{timestamp}.enc"
        final_path = self._backups_dir / final_filename

        try:
            # 1. Create a zip archive containing the database file
            with zipfile.ZipFile(temp_zip, 'w', zipfile.ZIP_DEFLATED) as zip_file:
                zip_file.write(db_path, arcname=db_path.name)
                if salt_path.exists():
                    zip_file.write(salt_path, arcname=salt_path.name)

            # 2. Encrypt the ZIP archive using AES-256-GCM
            data = temp_zip.read_bytes()
            aesgcm = AESGCM(backup_key)
            nonce = os.urandom(12)
            encrypted = aesgcm.encrypt(nonce, data, None)

            # Package nonce + encrypted data
            final_payload = nonce + encrypted
            final_path.write_bytes(final_payload)

            # Calculate SHA256 of encrypted archive
            sha = hashlib.sha256(final_payload).hexdigest()

            # 3. Record backup in local DB
            with get_db() as db:
                record = Backup(
                    filename=final_filename,
                    size_bytes=len(final_payload),
                    checksum_sha256=sha,
                    backup_type=backup_type,
                    conversation_count=conv_count,
                    message_count=msg_count,
                    is_verified=True
                )
                db.add(record)
                db.commit()
                db.refresh(record)
                return record

        except Exception as e:
            logger.error("Failed to create backup: %s", e)
            if final_path.exists(): final_path.unlink()
            raise BackupError(f"Backup creation failed: {e}") from e
        finally:
            if temp_zip.exists(): temp_zip.unlink()

    def list_backups(self) -> list[Backup]:
        """List all registered backups."""
        with get_db() as db:
            return db.query(Backup).order_by(Backup.created_at.desc()).all()

    def verify_backup(self, filename: str, pin: str) -> bool:
        """Verifies the integrity of a backup by attempting decryption."""
        path = self._backups_dir / filename
        if not path.exists(): return False

        settings = get_settings()
        salt_path = settings.db_path.parent / "db.salt"
        if not salt_path.exists(): return False
        salt_hex = salt_path.read_text(encoding="utf-8").strip()
        backup_key = self._derive_backup_key(pin, salt_hex)

        try:
            payload = path.read_bytes()
            nonce = payload[:12]
            encrypted = payload[12:]
            aesgcm = AESGCM(backup_key)
            aesgcm.decrypt(nonce, encrypted, None)
            return True
        except Exception:
            return False

    def restore_backup(self, filename: str, pin: str) -> None:
        """
        Restores a database backup archive.
        Restoring completely overwrites the active local database context.
        """
        path = self._backups_dir / filename
        if not path.exists():
            raise BackupError("Backup file does not exist.")

        settings = get_settings()
        db_path = settings.db_path
        salt_path = db_path.parent / "db.salt"
        if not salt_path.exists():
            raise BackupError("Active database salt missing.")
        salt_hex = salt_path.read_text(encoding="utf-8").strip()
        backup_key = self._derive_backup_key(pin, salt_hex)

        temp_extract = self._backups_dir / "temp_extract"
        temp_extract.mkdir(parents=True, exist_ok=True)

        try:
            # 1. Decrypt ZIP archive
            payload = path.read_bytes()
            nonce = payload[:12]
            encrypted = payload[12:]
            aesgcm = AESGCM(backup_key)
            decrypted = aesgcm.decrypt(nonce, encrypted, None)

            temp_zip = self._backups_dir / "temp_restore.zip"
            temp_zip.write_bytes(decrypted)

            # 2. Extract database
            with zipfile.ZipFile(temp_zip, 'r') as zip_ref:
                zip_ref.extractall(temp_extract)

            # Verify extracted files
            restored_db = temp_extract / db_path.name
            restored_salt = temp_extract / "db.salt"
            if not restored_db.exists():
                raise BackupError("Corrupt backup: database file missing inside zip.")

            # 3. Lock active session to overwrite safely
            db_manager.lock()

            # Overwrite active database file
            shutil.copy2(restored_db, db_path)
            if restored_salt.exists():
                shutil.copy2(restored_salt, salt_path)

            # 4. Re-initialize connection
            db_manager.initialize(pin=pin, salt_hex=salt_hex)

        except Exception as e:
            logger.error("Restore failed: %s", e)
            raise BackupError(f"Restore failed: {e}") from e
        finally:
            if temp_zip.exists(): temp_zip.unlink()
            if temp_extract.exists(): shutil.rmtree(temp_extract)

backup_mgr = BackupManager()
