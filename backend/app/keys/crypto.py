from cryptography.fernet import Fernet

from app.settings import settings

fernet = Fernet(settings.encryption_key)


def encrypt(value: str) -> bytes:
    return fernet.encrypt(value.encode())


def decrypt(ciphertext: bytes) -> str:
    return fernet.decrypt(ciphertext).decode()
