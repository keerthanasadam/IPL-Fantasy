import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_current_admin, get_current_user, get_db
from app.models.user import User
from app.schemas.auth import (
    AdminResetPasswordRequest,
    AdminResetPasswordResponse,
    ChangePasswordRequest,
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    LoginRequest,
    RegisterRequest,
    TokenResponse,
    UserResponse,
    UserUpdate,
)
from app.services.auth_service import (
    authenticate_user,
    change_password,
    create_access_token,
    forgot_password,
    register_user,
    reset_password_for_user,
    update_user_profile,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


async def _get_user_by_id(user_id: str, db: AsyncSession) -> User:
    stmt = select(User).where(User.id == uuid.UUID(user_id))
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    try:
        user = await register_user(db, body.email, body.password, body.display_name)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))
    return user


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    user = await authenticate_user(db, body.email, body.password)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    token = create_access_token(str(user.id), user.email)
    return TokenResponse(access_token=token)


@router.get("/me", response_model=UserResponse)
async def get_me(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user = await _get_user_by_id(current_user["user_id"], db)
    return user


@router.patch("/me", response_model=UserResponse)
async def update_me(
    body: UserUpdate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user = await _get_user_by_id(current_user["user_id"], db)
    return await update_user_profile(db, user, body.display_name)


@router.patch("/users/{user_id}", response_model=UserResponse)
async def admin_update_user(
    user_id: uuid.UUID,
    body: UserUpdate,
    current_user: dict = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: update any user's display name."""
    user = await _get_user_by_id(str(user_id), db)
    return await update_user_profile(db, user, body.display_name)


@router.post("/forgot-password", response_model=ForgotPasswordResponse)
async def forgot_password_endpoint(
    body: ForgotPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    temp = await forgot_password(db, body.email)
    # Always return 200 to prevent email enumeration
    return ForgotPasswordResponse(
        message="If this email exists, a temporary password has been generated.",
        temp_password=temp,
    )


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
async def change_password_endpoint(
    body: ChangePasswordRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user = await _get_user_by_id(current_user["user_id"], db)
    await change_password(db, user, body.current_password, body.new_password)


@router.post("/admin-reset-password", response_model=AdminResetPasswordResponse)
async def admin_reset_password(
    body: AdminResetPasswordRequest,
    _admin: dict = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    temp = await reset_password_for_user(db, str(body.user_id))
    return AdminResetPasswordResponse(temp_password=temp)
