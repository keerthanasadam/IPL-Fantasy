import secrets
import string
from datetime import datetime, timedelta, timezone

import bcrypt
from fastapi import HTTPException, status
from jose import jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.user import User


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def create_access_token(user_id: str, email: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.JWT_EXPIRE_MINUTES)
    payload = {"sub": user_id, "email": email, "exp": expire}
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def generate_temp_password() -> str:
    alphabet = string.ascii_uppercase + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(8))


async def register_user(db: AsyncSession, email: str, password: str, display_name: str) -> User:
    stmt = select(User).where(User.email == email)
    result = await db.execute(stmt)
    if result.scalar_one_or_none():
        raise ValueError("Email already registered")

    user = User(email=email, hashed_password=hash_password(password), display_name=display_name)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def authenticate_user(db: AsyncSession, email: str, password: str) -> User | None:
    stmt = select(User).where(User.email == email)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    if not user or not verify_password(password, user.hashed_password):
        return None
    return user


async def forgot_password(db: AsyncSession, email: str) -> str | None:
    """Generate a temp password for the user. Returns the temp password or None if email not found."""
    stmt = select(User).where(User.email == email)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    if not user:
        return None
    temp = generate_temp_password()
    user.hashed_password = hash_password(temp)
    user.must_change_password = True
    await db.commit()
    return temp


async def reset_password_for_user(db: AsyncSession, user_id: str) -> str:
    """Admin-initiated reset. Returns the temp password."""
    import uuid as uuid_mod
    stmt = select(User).where(User.id == uuid_mod.UUID(user_id))
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    temp = generate_temp_password()
    user.hashed_password = hash_password(temp)
    user.must_change_password = True
    await db.commit()
    return temp


async def change_password(db: AsyncSession, user: User, current_password: str | None, new_password: str) -> None:
    """Change a user's password. Skips current_password check if must_change_password is True."""
    if not user.must_change_password:
        if not current_password:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Current password is required",
            )
        if not verify_password(current_password, user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Current password is incorrect",
            )
    if len(new_password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be at least 6 characters",
        )
    user.hashed_password = hash_password(new_password)
    user.must_change_password = False
    await db.commit()


async def update_user_profile(db: AsyncSession, user: User, display_name: str) -> User:
    """Update display name. Raises 409 on duplicate."""
    from sqlalchemy.exc import IntegrityError
    user.display_name = display_name.strip()
    try:
        await db.commit()
        await db.refresh(user)
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This display name is already taken",
        )
    return user
