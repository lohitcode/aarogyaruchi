package otp

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"

	"aarogyaruchi/internal/cache"
)

const (
	otpTTL      = 5 * time.Minute
	devOTP      = "123456" // fixed OTP for staging/pre-launch mode
	msg91APIURL = "https://control.msg91.com/api/v5/otp"
)

var (
	ErrOTPExpired   = errors.New("otp expired or not found")
	ErrOTPInvalid   = errors.New("invalid otp")
	ErrTokenInvalid = errors.New("invalid token")
	ErrSendFailed   = errors.New("failed to send otp")
)

type Service struct {
	cache           *cache.Cache
	msg91AuthKey    string
	msg91TemplateID string
	// fixedOTP pins every code to 123456 (enabled via OTP_FIXED_ENABLED).
	// The fixed code is never logged or returned by API responses.
	fixedOTP bool
}

type OTPData struct {
	Phone string `json:"phone"`
	Code  string `json:"code"`
}

func New(cache *cache.Cache, msg91AuthKey, msg91TemplateID string, fixedOTP bool) *Service {
	return &Service{
		cache:           cache,
		msg91AuthKey:    msg91AuthKey,
		msg91TemplateID: msg91TemplateID,
		fixedOTP:        fixedOTP,
	}
}

// Send sends OTP and returns a temp token
func (s *Service) Send(ctx context.Context, phone string) (string, error) {
	token, err := generateToken()
	if err != nil {
		return "", ErrSendFailed
	}

	code := devOTP
	if !s.fixedOTP {
		// Production: send via MSG91. MSG91 generates its own OTP; we store
		// only the token -> phone mapping and verify through their API.
		if err := s.sendViaMSG91(ctx, phone); err != nil {
			return "", err
		}
		code = ""
	}

	data := OTPData{Phone: phone, Code: code}
	dataJSON, _ := json.Marshal(data)
	if err := s.cache.Set(ctx, tokenKey(token), string(dataJSON), otpTTL); err != nil {
		return "", ErrSendFailed
	}

	return token, nil
}

// Verify checks if token + OTP is valid and consumes the token.
func (s *Service) Verify(ctx context.Context, token, code string) (string, error) {
	key := tokenKey(token)

	dataJSON, err := s.cache.Get(ctx, key)
	if err != nil {
		return "", ErrTokenInvalid
	}

	var data OTPData
	if err := json.Unmarshal([]byte(dataJSON), &data); err != nil {
		return "", ErrTokenInvalid
	}

	if s.fixedOTP {
		if data.Code != code {
			return "", ErrOTPInvalid
		}
	} else {
		if err := s.verifyViaMSG91(ctx, data.Phone, code); err != nil {
			return "", err
		}
	}

	// OTP verified, consume the token
	_ = s.cache.Delete(ctx, key)

	return data.Phone, nil
}

func generateToken() (string, error) {
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes), nil
}

func tokenKey(token string) string {
	return fmt.Sprintf("otp_token:%s", token)
}

// MSG91 integration
func (s *Service) sendViaMSG91(ctx context.Context, phone string) error {
	payload := map[string]any{
		"template_id": s.msg91TemplateID,
		"mobile":      phone,
		"authkey":     s.msg91AuthKey,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return ErrSendFailed
	}

	req, err := http.NewRequestWithContext(ctx, "POST", msg91APIURL, bytes.NewBuffer(body))
	if err != nil {
		return ErrSendFailed
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("authkey", s.msg91AuthKey)

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return ErrSendFailed
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return ErrSendFailed
	}

	return nil
}

// verifyViaMSG91 verifies OTP using MSG91 API
func (s *Service) verifyViaMSG91(ctx context.Context, phone, code string) error {
	url := fmt.Sprintf("%s/verify?mobile=%s&otp=%s", msg91APIURL, phone, code)

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return ErrOTPInvalid
	}

	req.Header.Set("authkey", s.msg91AuthKey)

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return ErrOTPInvalid
	}
	defer resp.Body.Close()

	var result struct {
		Type    string `json:"type"`
		Message string `json:"message"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return ErrOTPInvalid
	}

	if result.Type != "success" {
		return ErrOTPInvalid
	}

	return nil
}
