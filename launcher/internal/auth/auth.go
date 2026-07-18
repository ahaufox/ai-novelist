package auth

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// ==================== 请求/响应模型 ====================

// UserInfo 用户信息
type UserInfo struct {
	Email      string `json:"email,omitempty"`
	IsVerified bool   `json:"is_verified,omitempty"`
	CreatedAt  string `json:"created_at,omitempty"`
}

// LoginResult 登录结果
type LoginResult struct {
	User            *UserInfo `json:"user,omitempty"`
	IsAuthenticated bool      `json:"isAuthenticated"`
}

// AuthStatus 认证状态
type AuthStatus struct {
	IsAuthenticated bool      `json:"isAuthenticated"`
	User            *UserInfo `json:"user,omitempty"`
}

// ==================== AuthService ====================

// AuthService 认证服务代理
// 将所有认证请求转发到 https://denghuominghui.top
type AuthService struct {
	baseURL    string
	httpClient *http.Client
	tokenStore *TokenStore
}

// NewAuthService 创建认证服务
func NewAuthService(tokenFile string) *AuthService {
	return &AuthService{
		baseURL: "https://denghuominghui.top",
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
		tokenStore: NewTokenStore(tokenFile),
	}
}

// ==================== 辅助方法 ====================

type proxyResult struct {
	StatusCode int
	Body       map[string]interface{}
}

func (s *AuthService) proxyJSON(method, path string, jsonData interface{}) (*proxyResult, error) {
	body, err := json.Marshal(jsonData)
	if err != nil {
		return nil, fmt.Errorf("序列化请求体失败: %w", err)
	}

	req, err := http.NewRequest(method, s.baseURL+path, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("创建请求失败: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("请求认证服务失败: %w", err)
	}
	defer resp.Body.Close()

	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("解析响应失败: %w", err)
	}

	return &proxyResult{StatusCode: resp.StatusCode, Body: result}, nil
}

func (s *AuthService) proxyForm(path, formData string) (int, map[string]interface{}, error) {
	req, err := http.NewRequest("POST", s.baseURL+path, strings.NewReader(formData))
	if err != nil {
		return 0, nil, fmt.Errorf("创建请求失败: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return 0, nil, fmt.Errorf("请求认证服务失败: %w", err)
	}
	defer resp.Body.Close()

	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return 0, nil, fmt.Errorf("解析响应失败: %w", err)
	}

	return resp.StatusCode, result, nil
}

func (s *AuthService) getWithBearer(path, token string) (int, map[string]interface{}, error) {
	req, err := http.NewRequest("GET", s.baseURL+path, nil)
	if err != nil {
		return 0, nil, fmt.Errorf("创建请求失败: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return 0, nil, fmt.Errorf("请求认证服务失败: %w", err)
	}
	defer resp.Body.Close()

	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		// 尝试读取原始 body
		rawBody, _ := io.ReadAll(resp.Body)
		return resp.StatusCode, map[string]interface{}{"detail": string(rawBody)}, nil
	}

	return resp.StatusCode, result, nil
}

func (s *AuthService) postWithBearer(path, token string) (int, map[string]interface{}, error) {
	req, err := http.NewRequest("POST", s.baseURL+path, nil)
	if err != nil {
		return 0, nil, fmt.Errorf("创建请求失败: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return 0, nil, fmt.Errorf("请求认证服务失败: %w", err)
	}
	defer resp.Body.Close()

	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return resp.StatusCode, map[string]interface{}{"detail": "解析响应失败"}, nil
	}

	return resp.StatusCode, result, nil
}

// ==================== 验证码 ====================

// SendVerifyCode 发送注册验证码
func (s *AuthService) SendVerifyCode(email string) error {
	result, err := s.proxyJSON("POST", "/auth/send-verify-code", map[string]string{"email": email})
	if err != nil {
		return err
	}
	if result.StatusCode != 200 {
		return fmt.Errorf("发送验证码失败: %v", getDetail(result.Body))
	}
	return nil
}

// SendResetCode 发送重置密码验证码
func (s *AuthService) SendResetCode(email string) error {
	result, err := s.proxyJSON("POST", "/auth/send-reset-code", map[string]string{"email": email})
	if err != nil {
		return err
	}
	if result.StatusCode != 200 {
		return fmt.Errorf("发送验证码失败: %v", getDetail(result.Body))
	}
	return nil
}

// ==================== 注册 ====================

// Register 注册新用户
func (s *AuthService) Register(email, password, code string) error {
	result, err := s.proxyJSON("POST", "/auth/register", map[string]string{
		"email":    email,
		"password": password,
		"code":     code,
	})
	if err != nil {
		return err
	}
	if result.StatusCode != 200 {
		return fmt.Errorf("注册失败: %v", getDetail(result.Body))
	}
	return nil
}

// ==================== 登录 ====================

// Login 登录，成功后持久化 token
func (s *AuthService) Login(username, password string) (*LoginResult, error) {
	form := url.Values{}
	form.Set("username", username)
	form.Set("password", password)

	status, body, err := s.proxyForm("/auth/login", form.Encode())
	if err != nil {
		return nil, err
	}

	if status != 200 {
		return nil, fmt.Errorf("登录失败: %v", getDetail(body))
	}

	accessToken, _ := body["access_token"].(string)
	refreshToken, _ := body["refresh_token"].(string)
	if accessToken == "" {
		return nil, fmt.Errorf("认证服务返回数据异常")
	}

	// 持久化 token
	if err := s.tokenStore.Save(accessToken, refreshToken); err != nil {
		return nil, fmt.Errorf("保存 token 失败: %w", err)
	}

	// 获取用户信息
	userInfo := s.fetchUserInfo(accessToken)

	return &LoginResult{
		User:            userInfo,
		IsAuthenticated: true,
	}, nil
}

// ==================== 登录状态 / 用户信息 ====================

// GetAuthStatus 检查当前登录状态
func (s *AuthService) GetAuthStatus() *AuthStatus {
	accessToken, _ := s.tokenStore.Load()
	if accessToken == "" {
		return &AuthStatus{IsAuthenticated: false}
	}

	// 尝试用 access_token 获取用户信息
	status, body, err := s.getWithBearer("/auth/me", accessToken)
	if err == nil && status == 200 {
		return &AuthStatus{
			IsAuthenticated: true,
			User:            parseUserInfo(body),
		}
	}

	// access_token 失效，尝试 refresh
	_, refreshToken := s.tokenStore.Load()
	if refreshToken != "" {
		rStatus, rBody, rErr := s.postWithBearer("/auth/refresh", refreshToken)
		if rErr == nil && rStatus == 200 {
			newAccess, _ := rBody["access_token"].(string)
			newRefresh := refreshToken
			if nr, ok := rBody["refresh_token"].(string); ok && nr != "" {
				newRefresh = nr
			}
			if newAccess != "" {
				s.tokenStore.Save(newAccess, newRefresh)
				// 用新 access_token 获取用户信息
				_, meBody, _ := s.getWithBearer("/auth/me", newAccess)
				return &AuthStatus{
					IsAuthenticated: true,
					User:            parseUserInfo(meBody),
				}
			}
		}
	}

	// 全部失败，清除 token
	s.tokenStore.Clear()
	return &AuthStatus{IsAuthenticated: false}
}

// GetUserInfo 获取当前用户信息
func (s *AuthService) GetUserInfo() (*UserInfo, error) {
	accessToken, _ := s.tokenStore.Load()
	if accessToken == "" {
		return nil, fmt.Errorf("未登录")
	}

	status, body, err := s.getWithBearer("/auth/me", accessToken)
	if err != nil {
		return nil, fmt.Errorf("认证服务不可用: %w", err)
	}

	if status == 200 {
		return parseUserInfo(body), nil
	}

	if status == 401 {
		// 尝试 refresh
		_, refreshToken := s.tokenStore.Load()
		if refreshToken != "" {
			rStatus, rBody, rErr := s.postWithBearer("/auth/refresh", refreshToken)
			if rErr == nil && rStatus == 200 {
				newAccess, _ := rBody["access_token"].(string)
				if newAccess != "" {
					s.tokenStore.Save(newAccess, refreshToken)
					_, meBody, _ := s.getWithBearer("/auth/me", newAccess)
					return parseUserInfo(meBody), nil
				}
			}
		}
		s.tokenStore.Clear()
		return nil, fmt.Errorf("未登录")
	}

	return nil, fmt.Errorf("获取用户信息失败: %v", getDetail(body))
}

// ==================== 登出 ====================

// Logout 登出，清除 token
func (s *AuthService) Logout() error {
	accessToken, _ := s.tokenStore.Load()
	s.tokenStore.Clear()

	if accessToken != "" {
		// 通知认证服务器（忽略错误）
		req, _ := http.NewRequest("POST", s.baseURL+"/auth/logout", nil)
		req.Header.Set("Authorization", "Bearer "+accessToken)
		resp, err := s.httpClient.Do(req)
		if err == nil {
			resp.Body.Close()
		}
	}

	return nil
}

// ==================== 重置密码 ====================

// ResetPassword 使用验证码重置密码
func (s *AuthService) ResetPassword(email, code, password string) error {
	result, err := s.proxyJSON("POST", "/auth/reset-password", map[string]string{
		"email":    email,
		"code":     code,
		"password": password,
	})
	if err != nil {
		return err
	}
	if result.StatusCode != 200 {
		return fmt.Errorf("重置密码失败: %v", getDetail(result.Body))
	}
	return nil
}

// ==================== 内部辅助 ====================

func (s *AuthService) fetchUserInfo(accessToken string) *UserInfo {
	status, body, err := s.getWithBearer("/auth/me", accessToken)
	if err != nil || status != 200 {
		return nil
	}
	return parseUserInfo(body)
}

func parseUserInfo(body map[string]interface{}) *UserInfo {
	if body == nil {
		return nil
	}
	info := &UserInfo{}
	if email, ok := body["email"].(string); ok {
		info.Email = email
	}
	if verified, ok := body["is_verified"].(bool); ok {
		info.IsVerified = verified
	}
	if createdAt, ok := body["created_at"].(string); ok {
		info.CreatedAt = createdAt
	}
	return info
}

func getDetail(body map[string]interface{}) interface{} {
	if body == nil {
		return "未知错误"
	}
	if detail, ok := body["detail"]; ok {
		return detail
	}
	return body
}
