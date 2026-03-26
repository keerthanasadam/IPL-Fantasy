import uuid
from pydantic import BaseModel, EmailStr


class RegisterRequest(BaseModel):
    email: str
    password: str
    display_name: str


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    id: uuid.UUID
    email: str
    display_name: str
    is_admin: bool
    must_change_password: bool = False

    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    display_name: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ForgotPasswordResponse(BaseModel):
    message: str
    temp_password: str | None = None


class ChangePasswordRequest(BaseModel):
    current_password: str | None = None
    new_password: str


class AdminResetPasswordRequest(BaseModel):
    user_id: uuid.UUID


class AdminResetPasswordResponse(BaseModel):
    temp_password: str
