import logging

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from backend.settings.settings import settings

logger = logging.getLogger(__name__)

AUTH_BASE_URL = "https://denghuominghui.top"

router = APIRouter(prefix="/api/auth", tags=["Auth"])

# ==================== 请求模型 ====================

class SendCodeRequest(BaseModel):
    email: str

class RegisterRequest(BaseModel):
    email: str
    password: str
    code: str

class LoginRequest(BaseModel):
    username: str
    password: str

class ResetPasswordRequest(BaseModel):
    email: str
    code: str
    password: str

# ==================== 辅助函数 ====================

async def _proxy(
    method: str, path: str, **kwargs
) -> JSONResponse:
    url = f"{AUTH_BASE_URL}{path}"
    async with httpx.AsyncClient(timeout=30) as client:
        try:
            resp = await client.request(method, url, **kwargs)
            try:
                body = resp.json()
            except Exception:
                body = {"detail": resp.text}
            return JSONResponse(status_code=resp.status_code, content=body)
        except httpx.RequestError as e:
            logger.error("认证服务请求失败: %s", e)
            raise HTTPException(status_code=502, detail="认证服务不可用")

async def _proxy_json(method: str, path: str, json_data: dict) -> JSONResponse:
    return await _proxy(method, path, json=json_data)

async def _proxy_form(path: str, form_data: str) -> tuple[int, dict]:
    url = f"{AUTH_BASE_URL}{path}"
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            url, content=form_data,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        return resp.status_code, resp.json()

# ==================== 公共端点 ====================

@router.post("/send-verify-code")
async def send_verify_code(req: SendCodeRequest):
    """发送注册验证码"""
    return await _proxy_json("POST", "/auth/send-verify-code", req.model_dump())

@router.post("/send-reset-code")
async def send_reset_code(req: SendCodeRequest):
    """发送重置密码验证码"""
    return await _proxy_json("POST", "/auth/send-reset-code", req.model_dump())

# ==================== 注册 ====================

@router.post("/register")
async def register(req: RegisterRequest):
    """注册新用户（需先获取验证码）"""
    return await _proxy_json("POST", "/auth/register", req.model_dump())

# ==================== 登录 ====================

@router.post("/login")
async def login(req: LoginRequest):
    """登录，后端持久化 token"""
    form = f"username={req.username}&password={req.password}"
    status, body = await _proxy_form("/auth/login", form)

    if status != 200:
        return JSONResponse(status_code=status, content=body)

    access_token = body.get("access_token")
    refresh_token = body.get("refresh_token")
    if not access_token:
        raise HTTPException(status_code=502, detail="认证服务返回数据异常")

    settings.save_tokens(access_token, refresh_token)

    async with httpx.AsyncClient(timeout=15) as client:
        try:
            me = await client.get(
                f"{AUTH_BASE_URL}/auth/me",
                headers={"Authorization": f"Bearer {access_token}"},
            )
            user_info = me.json() if me.status_code == 200 else None
        except Exception:
            user_info = None

    return JSONResponse(status_code=200, content={
        "user": user_info,
        "isAuthenticated": True,
    })

# ==================== 登录状态 / 用户信息 ====================

@router.get("/status")
async def get_auth_status():
    """检查登录状态"""
    access_token = settings.get_access_token()
    if not access_token:
        return JSONResponse(status_code=200, content={
            "isAuthenticated": False, "user": None,
        })

    async with httpx.AsyncClient(timeout=10) as client:
        try:
            resp = await client.get(
                f"{AUTH_BASE_URL}/auth/me",
                headers={"Authorization": f"Bearer {access_token}"},
            )
            if resp.status_code == 200:
                return JSONResponse(status_code=200, content={
                    "isAuthenticated": True, "user": resp.json(),
                })
        except httpx.RequestError:
            return JSONResponse(status_code=200, content={
                "isAuthenticated": False, "user": None,
            })

    # access_token 失效，尝试刷新
    refresh_token = settings.get_refresh_token()
    if refresh_token:
        try:
            r = await client.post(
                f"{AUTH_BASE_URL}/auth/refresh",
                headers={"Authorization": f"Bearer {refresh_token}"},
            )
            if r.status_code == 200:
                new_access = r.json().get("access_token")
                if new_access:
                    settings.save_tokens(new_access, refresh_token)
                    me = await client.get(
                        f"{AUTH_BASE_URL}/auth/me",
                        headers={"Authorization": f"Bearer {new_access}"},
                    )
                    return JSONResponse(status_code=200, content={
                        "isAuthenticated": True,
                        "user": me.json() if me.status_code == 200 else None,
                    })
        except Exception:
            pass

    settings.clear_tokens()
    return JSONResponse(status_code=200, content={
        "isAuthenticated": False, "user": None,
    })

@router.get("/me")
async def get_current_user():
    """获取当前用户信息"""
    access_token = settings.get_access_token()
    if not access_token:
        raise HTTPException(status_code=401, detail="未登录")

    async with httpx.AsyncClient(timeout=15) as client:
        try:
            resp = await client.get(
                f"{AUTH_BASE_URL}/auth/me",
                headers={"Authorization": f"Bearer {access_token}"},
            )
            if resp.status_code == 200:
                return JSONResponse(status_code=200, content=resp.json())

            if resp.status_code == 401:
                refresh_token = settings.get_refresh_token()
                if refresh_token:
                    r = await client.post(
                        f"{AUTH_BASE_URL}/auth/refresh",
                        headers={"Authorization": f"Bearer {refresh_token}"},
                    )
                    if r.status_code == 200:
                        new_access = r.json().get("access_token")
                        if new_access:
                            settings.save_tokens(new_access, refresh_token)
                            retry = await client.get(
                                f"{AUTH_BASE_URL}/auth/me",
                                headers={"Authorization": f"Bearer {new_access}"},
                            )
                            return JSONResponse(status_code=retry.status_code, content=retry.json())
                settings.clear_tokens()
            return JSONResponse(status_code=resp.status_code, content=resp.json())
        except httpx.RequestError as e:
            raise HTTPException(status_code=502, detail=f"认证服务不可用: {e}")

@router.post("/refresh")
async def refresh_token():
    """刷新 access_token"""
    refresh = settings.get_refresh_token()
    if not refresh:
        raise HTTPException(status_code=401, detail="没有可用的 refresh_token")

    async with httpx.AsyncClient(timeout=15) as client:
        try:
            resp = await client.post(
                f"{AUTH_BASE_URL}/auth/refresh",
                headers={"Authorization": f"Bearer {refresh}"},
            )
            body = resp.json()
            if resp.status_code == 200:
                new_access = body.get("access_token")
                if new_access:
                    settings.save_tokens(new_access, refresh)
                    return JSONResponse(status_code=200, content={"detail": "Token 已刷新"})
            return JSONResponse(status_code=resp.status_code, content=body)
        except httpx.RequestError as e:
            raise HTTPException(status_code=502, detail=f"认证服务不可用: {e}")

# ==================== 登出 ====================

@router.post("/logout")
async def logout():
    """登出"""
    access_token = settings.get_access_token()
    settings.clear_tokens()

    if access_token:
        async with httpx.AsyncClient(timeout=10) as client:
            try:
                await client.post(
                    f"{AUTH_BASE_URL}/auth/logout",
                    headers={"Authorization": f"Bearer {access_token}"},
                )
            except Exception:
                pass

    return JSONResponse(status_code=200, content={"detail": "已成功登出"})

# ==================== 重置密码 ====================

@router.post("/reset-password")
async def reset_password(req: ResetPasswordRequest):
    """使用验证码重置密码（需先获取重置验证码）"""
    return await _proxy_json("POST", "/auth/reset-password", req.model_dump())
