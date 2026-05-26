const mysql = require('mysql2/promise');
require('dotenv').config();

// Create connection pool
// DATABASE_URL 우선 사용 (Railway 공용 URL), 없으면 개별 환경변수 사용
const dbUrl = process.env.DATABASE_URL || process.env.MYSQL_URL || process.env.MYSQL_PUBLIC_URL;

const poolConfig = dbUrl ? {
    uri: dbUrl,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
} : {
    host: process.env.DB_HOST || process.env.MYSQLHOST,
    port: parseInt(process.env.DB_PORT || process.env.MYSQLPORT || 3306),
    user: process.env.DB_USER || process.env.MYSQLUSER,
    password: process.env.DB_PASSWORD || process.env.MYSQLPASSWORD,
    database: process.env.DB_NAME || process.env.MYSQLDATABASE || 'railway',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
};

console.log('🔌 DB connection mode:', dbUrl ? 'DATABASE_URL' : `host=${process.env.DB_HOST || process.env.MYSQLHOST}`);

const pool = mysql.createPool(poolConfig);

// Test connection
async function testConnection() {
    try {
        const connection = await pool.getConnection();
        console.log('✅ MySQL Database connected successfully');
        connection.release();
        return true;
    } catch (error) {
        console.error('❌ MySQL connection error:', error.message);
        return false;
    }
}

// Initialize database tables
async function initializeDatabase() {
    try {
        const connection = await pool.getConnection();
        
        // Create orders table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS orders (
                id VARCHAR(50) PRIMARY KEY,
                table_number INT NOT NULL,
                total DECIMAL(10, 2) NOT NULL,
                status ENUM('pending', 'cooking', 'completed', 'cancelled') DEFAULT 'pending',
                payment_status ENUM('pending','paid','failed','refunded') DEFAULT 'paid',
                payment_method VARCHAR(50) NULL,
                payment_key VARCHAR(200) NULL,
                paid_at TIMESTAMP NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                completed_at TIMESTAMP NULL,
                INDEX idx_table_number (table_number),
                INDEX idx_status (status),
                INDEX idx_payment_status (payment_status),
                INDEX idx_created_at (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        // Migration: add payment columns to existing orders table (idempotent)
        const paymentColumns = [
            { name: 'payment_status', def: "ENUM('pending','paid','failed','refunded') DEFAULT 'paid'" },
            { name: 'payment_method', def: 'VARCHAR(50) NULL' },
            { name: 'payment_key',    def: 'VARCHAR(200) NULL' },
            { name: 'paid_at',        def: 'TIMESTAMP NULL' },
        ];
        for (const col of paymentColumns) {
            try {
                await connection.query(`ALTER TABLE orders ADD COLUMN ${col.name} ${col.def}`);
                console.log(`✅ orders.${col.name} column added`);
            } catch (e) {
                // already exists - ignore
            }
        }
        try {
            await connection.query("ALTER TABLE orders ADD INDEX idx_payment_status (payment_status)");
        } catch (e) { /* exists */ }

        // Create order_items table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS order_items (
                id INT AUTO_INCREMENT PRIMARY KEY,
                order_id VARCHAR(50) NOT NULL,
                item_name VARCHAR(100) NOT NULL,
                price DECIMAL(10, 2) NOT NULL,
                quantity INT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
                INDEX idx_order_id (order_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        // Create staff_calls table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS staff_calls (
                id VARCHAR(50) PRIMARY KEY,
                table_number INT NOT NULL,
                message VARCHAR(255) NOT NULL,
                status ENUM('pending', 'completed') DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                completed_at TIMESTAMP NULL,
                INDEX idx_table_number (table_number),
                INDEX idx_status (status),
                INDEX idx_created_at (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        // Create menu_items table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS menu_items (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(100) NOT NULL UNIQUE,
                category VARCHAR(50) NOT NULL,
                price DECIMAL(10, 2) NOT NULL,
                is_available BOOLEAN DEFAULT TRUE,
                sort_order INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_category (category),
                INDEX idx_is_available (is_available)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        // 기존 테이블에 sort_order 컬럼 없을 경우 추가 (마이그레이션)
        try {
            await connection.query('ALTER TABLE menu_items ADD COLUMN sort_order INT DEFAULT 0 AFTER is_available');
            console.log('✅ sort_order column added');
        } catch (e) {
            // 이미 존재하면 무시
        }

        // Seed menu items — 기존 전체 삭제 후 새 메뉴로 교체
        await connection.query(`DELETE FROM menu_items`);
        await connection.query(`
            INSERT INTO menu_items (name, category, price, sort_order) VALUES
            ('토종닭 백숙',          '메인메뉴',  65000,  1),
            ('오리 백숙',            '메인메뉴',  70000,  2),
            ('토종옻닭 백숙',        '메인메뉴',  70000,  3),
            ('오리옻 백숙',          '메인메뉴',  75000,  4),
            ('들깨·녹두 닭백숙',     '메인메뉴',  70000,  5),
            ('들깨·녹두 오리백숙',   '메인메뉴',  75000,  6),
            ('오리불고기',           '메인메뉴',  45000,  7),
            ('볶음밥',               '메인메뉴',   2000,  8),
            ('장수탕 닭 또는 오리',  '특선',     130000, 10),
            ('왕새우 4마리',         '추가메뉴',  15000, 20),
            ('왕홍합 10마리',        '추가메뉴',  10000, 21),
            ('왕쭈구미 1마리',        '추가메뉴',  10000, 22),
            ('전복 4마리',           '추가메뉴',  15000, 23),
            ('가리비 4마리',         '추가메뉴',  15000, 24),
            ('죽 포장',              '추가메뉴',  10000, 25),
            ('도토리묵무침',         '사이드',    12000, 30),
            ('소주',                 '주류',       4000, 40),
            ('맥주',                 '주류',       4000, 41),
            ('막걸리',               '주류',       4000, 42),
            ('음료수',               '주류',       2000, 43)
        `);

        console.log('✅ Database tables initialized');
        connection.release();
    } catch (error) {
        console.error('❌ Database initialization error:', error.message);
        throw error;
    }
}

module.exports = {
    pool,
    testConnection,
    initializeDatabase
};

// Made with Bob
