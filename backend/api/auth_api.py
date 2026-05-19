import logging
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from backend.settings.settings import settings

logger = logging.getLogger(__name__)

# 远程认证服务器地址
AUTH_BASE_URL = "https://denghuominghui.top"

# 创建API路由器
router = APIRouter(prefix="/api/auth", tags=["Auth"])

# ==================== 请求模型 ====================

class LoginRequest(BaseModel):
    username: str  # 邮箱
    password: str

class RegisterRequest(BaseModel):
    email: str
    password: str

class RefreshRequest(BaseModel):
    refresh_token: str

class ForgotPasswordRequest(BaseModel):
    email: str

class ResetPasswordRequest(BaseModel):
    token: str
    password: str

# ==================== 辅助函数 ====================

async def _proxy_request(
    method: str,
    path: str,
    data: Any = None,
    json_data: Any = None,
    token: str | None = None,
    content_type: str | None = None,
) -> JSONResponse:
    """向远程认证服务器转发请求"""
    url = f"{AUTH_BASE_URL}{path}"
    headers = {}
    
    if token:
        headers["Authorization"] = f"Bearer {token}"
    
    if content_type:
        headers["Content-Type"] = content_type
    
    async with httpx.AsyncClient(timeout=30) as client:
        try:
            response = await client.request(
                method, url, headers=headers, content=data, json=json_data,
            )
            try:
                body = response.json()
            except Exception:
                body = {"detail": response.text}
            return JSONResponse(status_code=response.status_code, content=body)
        except httpx.RequestError as e:
            logger.error("代理请求失败: %s", e)
            raise HTTPException(status_code=502, detail=f"认证服务不可用: {str(e)}")

# ==================== 认证端点 ====================

@router.post("/login", summary="登录")
async def login(request: LoginRequest):
    """登录：代理到远程认证服务器，持久化 token，返回用户信息
    
    前端调用此接口后无需管理 token，后端自动存储。
    """
    # 1. 代理登录请求
    form_data = f"username={request.username}&password={request.password}"
    url = f"{AUTH_BASE_URL}/auth/login"
    
    async with httpx.AsyncClient(timeout=30) as client:
        try:
            resp = await client.post(
                url,
                content=form_data,
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
            login_body = resp.json()
        except httpx.RequestError as e:
            logger.error("登录请求失败: %s", e)
            raise HTTPException(status_code=502, detail="认证服务不可用")
        except Exception:
            login_body = {"detail": "认证服务响应异常"}
    
    if resp.status_code != 200:
        return JSONResponse(status_code=resp.status_code, content=login_body)
    
    access_token = login_body.get("access_token")
    refresh_token = login_body.get("refresh_token")
    if not access_token:
        raise HTTPException(status_code=502, detail="认证服务返回数据异常")
    
    # 2. 持久化 token
    settings.save_tokens(access_token, refresh_token)
    
    # 3. 获取用户信息
    try:
        me_resp = await client.get(
            f"{AUTH_BASE_URL}/auth/me",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        user_info = me_resp.json() if me_resp.status_code == 200 else None
    except Exception:
        user_info = None
    
    # 4. 返回用户信息（不返回 token 给前端）
    return JSONResponse(status_code=200, content={
        "user": user_info,
        "isAuthenticated": True,
    })


@router.post("/register", summary="注册")
async def register(request: RegisterRequest):
    """注册新用户"""
    return await _proxy_request(
        "POST", "/auth/register",
        json_data=request.model_dump(),
    )


@router.get("/status", summary="获取登录状态")
async def get_auth_status():
    """检查当前是否有有效的登录状态（即是否存在持久化的 token）"""
    access_token = settings.get_access_token()
    if not access_token:
        return JSONResponse(status_code=200, content={
            "isAuthenticated": False,
            "user": None,
        })
    
    # 验证 token 是否有效
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            resp = await client.get(
                f"{AUTH_BASE_URL}/auth/me",
                headers={"Authorization": f"Bearer {access_token}"},
            )
            if resp.status_code == 200:
                user = resp.json()
                return JSONResponse(status_code=200, content={
                    "isAuthenticated": True,
                    "user": user,
                })
            else:
                # token 可能过期，尝试 refresh
                logger.info("access_token 无效，尝试刷新")
        except httpx.RequestError:
            # 远程服务不可达，返回离线状态
            return JSONResponse(status_code=200, content={
                "isAuthenticated": False,
                "user": None,
            })
    
    # access_token 失效，尝试用 refresh_token 刷新
    refresh_token = settings.get_refresh_token()
    if refresh_token:
        try:
            refresh_resp = await client.post(
                f"{AUTH_BASE_URL}/auth/refresh",
                headers={"Authorization": f"Bearer {refresh_token}"},
            )
            if refresh_resp.status_code == 200:
                new_tokens = refresh_resp.json()
                new_access = new_tokens.get("access_token")
                if new_access:
                    settings.save_tokens(new_access, refresh_token)
                    # 重新获取用户信息
                    me_resp = await client.get(
                        f"{AUTH_BASE_URL}/auth/me",
                        headers={"Authorization": f"Bearer {new_access}"},
                    )
                    user = me_resp.json() if me_resp.status_code == 200 else None
                    return JSONResponse(status_code=200, content={
                        "isAuthenticated": True,
                        "user": user,
                    })
        except Exception:
            pass
    
    # 全都不行，清除 token
    settings.clear_tokens()
    return JSONResponse(status_code=200, content={
        "isAuthenticated": False,
        "user": None,
    })


@router.get("/me", summary="获取当前用户信息")
async def get_current_user():
    """使用持久化的 token 获取当前用户信息"""
    access_token = settings.get_access_token()
    if not access_token:
        raise HTTPException(status_code=401, detail="未登录")
    
    async with httpx.AsyncClient(timeout=15) as client:
        try:
            resp = await client.get(
                f"{AUTH_BASE_URL}/auth/me",
                headers={"Authorization": f"Bearer {access_token}"},
            )
            body = resp.json()
            if resp.status_code == 200:
                return JSONResponse(status_code=200, content=body)
            # token 过期，尝试刷新
            if resp.status_code == 401:
                # 尝试 refresh
                refresh_token = settings.get_refresh_token()
                if refresh_token:
                    refresh_resp = await client.post(
                        f"{AUTH_BASE_URL}/auth/refresh",
                        headers={"Authorization": f"Bearer {refresh_token}"},
                    )
                    if refresh_resp.status_code == 200:
                        new_access = refresh_resp.json().get("access_token")
                        if new_access:
                            settings.save_tokens(new_access, refresh_token)
                            # 重试获取用户信息
                            retry = await client.get(
                                f"{AUTH_BASE_URL}/auth/me",
                                headers={"Authorization": f"Bearer {new_access}"},
                            )
                            return JSONResponse(status_code=retry.status_code, content=retry.json())
                # 刷新失败，清除 token
                settings.clear_tokens()
            return JSONResponse(status_code=resp.status_code, content=body)
        except httpx.RequestError as e:
            raise HTTPException(status_code=502, detail=f"认证服务不可用: {str(e)}")


@router.post("/logout", summary="登出")
async def logout():
    """登出：清除本地持久化的 token，并通知远程服务器"""
    access_token = settings.get_access_token()
    
    # 先清除本地 token（无论如何都清除）
    settings.clear_tokens()
    
    # 通知远程服务器（忽略结果）
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


@router.post("/forgot-password", summary="忘记密码")
async def forgot_password(request: ForgotPasswordRequest):
    """发送密码重置邮件"""
    return await _proxy_request(
        "POST", "/auth/forgot-password",
        json_data=request.model_dump(),
    )


@router.post("/reset-password", summary="重置密码")
async def reset_password(request: ResetPasswordRequest):
    """使用邮件中的 token 重置密码"""
    return await _proxy_request(
        "POST", "/auth/reset-password",
        json_data=request.model_dump(),
    )


@router.post("/refresh", summary="刷新 Token")
async def refresh_token():
    """使用存储的 refresh_token 刷新 access_token"""
    refresh_token = settings.get_refresh_token()
    if not refresh_token:
        raise HTTPException(status_code=401, detail="没有可用的 refresh_token")
    
    async with httpx.AsyncClient(timeout=15) as client:
        try:
            resp = await client.post(
                f"{AUTH_BASE_URL}/auth/refresh",
                headers={"Authorization": f"Bearer {refresh_token}"},
            )
            body = resp.json()
            if resp.status_code == 200:
                new_access = body.get("access_token")
                if new_access:
                    settings.save_tokens(new_access, refresh_token)
                    return JSONResponse(status_code=200, content={"detail": "Token 已刷新"})
            return JSONResponse(status_code=resp.status_code, content=body)
        except httpx.RequestError as e:
            raise HTTPException(status_code=502, detail=f"认证服务不可用: {str(e)}")
