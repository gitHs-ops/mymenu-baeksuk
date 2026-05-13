# Railway 배포 가이드

이 문서는 Restaurant QR Order System을 Railway에 배포하는 방법을 설명합니다.

## 📋 사전 준비

1. **Railway 계정 생성**
   - https://railway.app 에서 회원가입
   - GitHub 계정으로 로그인 권장

2. **GitHub 저장소 생성**
   - 프로젝트를 GitHub에 푸시

## 🚀 배포 단계

### 1. Railway 프로젝트 생성

1. Railway 대시보드에서 "New Project" 클릭
2. "Deploy from GitHub repo" 선택
3. 저장소 선택 및 연결

### 2. MySQL 데이터베이스 추가

1. 프로젝트에서 "New" 클릭
2. "Database" → "Add MySQL" 선택
3. MySQL 인스턴스가 자동으로 생성됨

### 3. 환경 변수 설정

Railway 프로젝트 설정에서 다음 환경 변수를 추가:

```
DB_HOST=<Railway MySQL Host>
DB_PORT=3306
DB_USER=root
DB_PASSWORD=<Railway MySQL Password>
DB_NAME=railway
PORT=3000
NODE_ENV=production
FRONTEND_URL=<Your Railway App URL>
```

**MySQL 연결 정보 확인:**
- Railway 대시보드에서 MySQL 서비스 클릭
- "Connect" 탭에서 연결 정보 확인
- 또는 "Variables" 탭에서 자동 생성된 변수 사용

### 4. 데이터베이스 초기화

Railway MySQL에 접속하여 스키마 실행:

**방법 1: Railway CLI 사용**
```bash
# Railway CLI 설치
npm install -g @railway/cli

# 로그인
railway login

# 프로젝트 연결
railway link

# MySQL 쉘 접속
railway run mysql -h $DB_HOST -u $DB_USER -p$DB_PASSWORD $DB_NAME

# 스키마 파일 실행
source database/schema.sql
```

**방법 2: MySQL Workbench 사용**
1. Railway에서 MySQL 연결 정보 복사
2. MySQL Workbench에서 새 연결 생성
3. `database/schema.sql` 파일 실행

**방법 3: 자동 초기화 (권장)**
- 서버가 시작될 때 자동으로 테이블 생성됨
- `database/db.js`의 `initializeDatabase()` 함수가 실행됨

### 5. 배포 확인

1. Railway가 자동으로 빌드 및 배포 시작
2. "Deployments" 탭에서 진행 상황 확인
3. 배포 완료 후 생성된 URL 확인

### 6. 도메인 설정 (선택사항)

1. Railway 프로젝트 설정에서 "Settings" 클릭
2. "Domains" 섹션에서 커스텀 도메인 추가
3. DNS 설정에서 CNAME 레코드 추가

## 🔧 Railway 설정 파일

Railway는 자동으로 `package.json`의 `start` 스크립트를 실행합니다.

현재 설정:
```json
{
  "scripts": {
    "start": "node server.js"
  }
}
```

## 📊 모니터링

Railway 대시보드에서 확인 가능:
- 실시간 로그
- 메모리 사용량
- CPU 사용량
- 네트워크 트래픽

## 🐛 문제 해결

### 데이터베이스 연결 오류
```
Error: connect ECONNREFUSED
```
**해결방법:**
- 환경 변수가 올바르게 설정되었는지 확인
- MySQL 서비스가 실행 중인지 확인
- Railway MySQL의 "Variables" 탭에서 자동 생성된 변수 사용

### 포트 오류
```
Error: listen EADDRINUSE
```
**해결방법:**
- `PORT` 환경 변수를 Railway가 제공하는 포트로 설정
- Railway는 자동으로 `PORT` 환경 변수를 제공함

### WebSocket 연결 오류
**해결방법:**
- HTTPS를 사용하는 경우 WSS 프로토콜 사용
- `api-client.js`에서 자동으로 처리됨

## 💰 비용

Railway 무료 플랜:
- $5 크레딧/월 (약 500시간 실행)
- 소규모 프로젝트에 충분

유료 플랜:
- Hobby: $5/월 (무제한 실행)
- Pro: $20/월 (추가 리소스)

## 🔄 업데이트 배포

1. GitHub에 코드 푸시
2. Railway가 자동으로 재배포
3. 또는 Railway CLI 사용:
```bash
railway up
```

## 📱 접속 URL

배포 후 다음 URL로 접속:
- 고객용: `https://your-app.railway.app/`
- 관리자용: `https://your-app.railway.app/admin`
- QR 생성기: `https://your-app.railway.app/qr-generator`

## 🔐 보안 권장사항

1. **환경 변수 보호**
   - `.env` 파일을 Git에 커밋하지 않기
   - Railway 대시보드에서만 환경 변수 설정

2. **데이터베이스 보안**
   - 강력한 비밀번호 사용
   - Railway MySQL은 기본적으로 외부 접근 제한

3. **HTTPS 사용**
   - Railway는 자동으로 HTTPS 제공
   - 커스텀 도메인도 무료 SSL 인증서 제공

## 📞 지원

문제가 발생하면:
- Railway 문서: https://docs.railway.app
- Railway Discord: https://discord.gg/railway
- GitHub Issues: 프로젝트 저장소에 이슈 등록