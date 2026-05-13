# 🔧 문제 해결 가이드

Railway 배포 시 자주 발생하는 문제와 해결 방법을 정리했습니다.

## 📋 체크리스트 (배포 전 필수 확인)

배포하기 전에 다음 사항들을 확인하세요:

### ✅ 1. 코드 준비
- [ ] `package.json`에 `start` 스크립트 있음
- [ ] `server.js` 파일 존재
- [ ] `.gitignore`에 `node_modules`, `.env` 포함
- [ ] Railway 환경 변수 지원 코드 포함 (MYSQLHOST 등)

### ✅ 2. Railway 설정
- [ ] GitHub 저장소 연결됨
- [ ] MySQL 서비스 추가됨
- [ ] 환경 변수 자동 생성됨 (MYSQLHOST, MYSQLUSER 등)
- [ ] Node.js 서비스와 MySQL 서비스가 같은 프로젝트에 있음

### ✅ 3. 배포 확인
- [ ] 빌드 성공
- [ ] 서버 시작 성공
- [ ] 로그에 "Database connected" 메시지 확인
- [ ] 로그에 "Database tables initialized" 메시지 확인

---

## 🐛 자주 발생하는 문제

### 1️⃣ "Database not configured" 오류

**증상:**
```
⚠️  Running without database (Railway will provide DB credentials)
```

**원인:**
- Railway MySQL 변수를 코드가 인식하지 못함

**해결:**
✅ **이미 수정됨!** 현재 코드는 Railway 변수를 자동으로 인식합니다.

**확인 방법:**
```javascript
// database/db.js에서 확인
host: process.env.DB_HOST || process.env.MYSQLHOST,  // ✅ 이렇게 되어 있어야 함
```

---

### 2️⃣ "SHOW TABLES" 결과가 0 rows

**증상:**
```sql
SHOW TABLES;
Empty set (0.00 sec)
```

**원인:**
- 서버가 아직 실행되지 않음
- 데이터베이스 연결 실패
- 테이블 생성 코드 실행 안됨

**해결:**

**A. 서버 로그 확인**
```bash
railway logs
```

다음 메시지가 있어야 함:
```
✅ Database connected and initialized
```

**B. 수동으로 테이블 생성**
```bash
railway connect MySQL
```

```sql
USE railway;

CREATE TABLE IF NOT EXISTS orders (
    id VARCHAR(50) PRIMARY KEY,
    table_number INT NOT NULL,
    total DECIMAL(10, 2) NOT NULL,
    status ENUM('pending', 'cooking', 'completed', 'cancelled') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    completed_at TIMESTAMP NULL,
    INDEX idx_table_number (table_number),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS order_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id VARCHAR(50) NOT NULL,
    item_name VARCHAR(100) NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    quantity INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    INDEX idx_order_id (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SHOW TABLES;
```

---

### 3️⃣ "connect ECONNREFUSED" 오류

**증상:**
```
Error: connect ECONNREFUSED ::1:3306
```

**원인:**
- 로컬에서 MySQL이 설치되지 않음
- MySQL 서비스가 실행되지 않음

**해결:**

**A. 로컬 테스트 (메모리 모드)**
```bash
# .env 파일 삭제 또는 비우기
# 서버가 메모리 모드로 실행됨
npm start
```

**B. Railway에 배포**
```bash
git add .
git commit -m "Deploy to Railway"
git push
```

Railway에서는 자동으로 MySQL 연결됨!

---

### 4️⃣ 환경 변수 관련 오류

**증상:**
```
undefined is not a valid host
```

**원인:**
- 환경 변수가 설정되지 않음

**해결:**

**Railway 대시보드 확인:**
1. MySQL 서비스 → Variables 탭
2. 다음 변수들이 있는지 확인:
   - MYSQLHOST
   - MYSQLUSER
   - MYSQLPASSWORD
   - MYSQLDATABASE
   - MYSQLPORT

**없다면:**
- MySQL 서비스 삭제 후 재추가
- 또는 "New" → "Database" → "Add MySQL"

---

### 5️⃣ 빌드 실패

**증상:**
```
npm ERR! missing script: start
```

**원인:**
- package.json에 start 스크립트 없음

**해결:**

`package.json` 확인:
```json
{
  "scripts": {
    "start": "node server.js"  // ✅ 이게 있어야 함
  }
}
```

---

### 6️⃣ 포트 오류

**증상:**
```
Error: listen EADDRINUSE :::3000
```

**원인:**
- 포트가 이미 사용 중

**해결:**

**A. Railway (자동 처리)**
Railway는 자동으로 PORT 환경 변수 제공

**B. 로컬**
```bash
# 다른 포트 사용
PORT=3001 npm start

# 또는 실행 중인 프로세스 종료
# Windows:
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# Mac/Linux:
lsof -ti:3000 | xargs kill -9
```

---

## 🚀 완벽한 배포 프로세스

### 단계 1: 로컬 테스트
```bash
# 의존성 설치
npm install

# 서버 실행 (메모리 모드)
npm start

# 브라우저에서 확인
# http://localhost:3000
```

### 단계 2: Git 커밋
```bash
git add .
git commit -m "Restaurant QR Order System"
git push
```

### 단계 3: Railway 배포
```
1. Railway 대시보드 접속
2. "New Project" 클릭
3. "Deploy from GitHub repo" 선택
4. 저장소 선택
5. "Add MySQL" 클릭
6. 자동 배포 대기
```

### 단계 4: 확인
```bash
# 로그 확인
railway logs

# 다음 메시지 확인:
# ✅ Database connected and initialized
# 🚀 Server running on port 8080

# MySQL 접속
railway connect MySQL

# 테이블 확인
SHOW TABLES;
```

---

## 💡 예방 팁

### 1. 환경 변수 유연성
코드에서 여러 변수명 지원:
```javascript
host: process.env.DB_HOST || process.env.MYSQLHOST || 'localhost',
```

### 2. 에러 처리
```javascript
try {
    await testConnection();
} catch (error) {
    console.error('DB connection failed:', error.message);
    // 메모리 모드로 폴백
}
```

### 3. 로깅 강화
```javascript
console.log('🔌 Connecting to:', process.env.MYSQLHOST);
console.log('👤 User:', process.env.MYSQLUSER);
console.log('📦 Database:', process.env.MYSQLDATABASE);
```

### 4. 헬스체크 엔드포인트
```javascript
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        database: USE_DATABASE ? 'connected' : 'not configured',
        timestamp: new Date()
    });
});
```

---

## 📞 추가 도움

### Railway 문서
- https://docs.railway.app
- https://docs.railway.app/databases/mysql

### Railway Discord
- https://discord.gg/railway

### 이 프로젝트 Issues
- GitHub Issues에 문의

---

## ✅ 최종 체크리스트

배포 전 마지막 확인:

- [ ] `npm install` 성공
- [ ] `npm start` 로컬에서 실행됨
- [ ] Git 커밋 완료
- [ ] GitHub 푸시 완료
- [ ] Railway 프로젝트 생성
- [ ] MySQL 서비스 추가
- [ ] 배포 성공
- [ ] 로그에서 "Database connected" 확인
- [ ] `railway connect MySQL` 접속 가능
- [ ] `SHOW TABLES;` 결과 2개 테이블
- [ ] 웹사이트 접속 가능
- [ ] 주문 테스트 성공

모든 항목이 체크되면 완료! 🎉