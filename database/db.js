const mysql = require('mysql2/promise');
require('dotenv').config();

// Create connection pool
// Support both custom env vars and Railway's default MySQL vars
const pool = mysql.createPool({
    host: process.env.DB_HOST || process.env.MYSQLHOST,
    port: process.env.DB_PORT || process.env.MYSQLPORT || 3306,
    user: process.env.DB_USER || process.env.MYSQLUSER,
    password: process.env.DB_PASSWORD || process.env.MYSQLPASSWORD,
    database: process.env.DB_NAME || process.env.MYSQLDATABASE || 'railway',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
});

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
            ('탕수육 미니',   '탕수육',  15000,  1),
            ('탕수육 (소)',   '탕수육',  20000,  2),
            ('탕수육 (중)',   '탕수육',  25000,  3),
            ('탕수육 (대)',   '탕수육',  30000,  4),
            ('양장피',       '요리',    50000, 10),
            ('팔보채',       '요리',    50000, 11),
            ('깐풍육',       '요리',    40000, 12),
            ('라조육',       '요리',    40000, 13),
            ('쟁반짜장',     '요리',    24000, 14),
            ('쟁반짬뽕',     '요리',    26000, 15),
            ('짬짜면',       '요리',    10000, 16),
            ('군만두',       '요리',     6000, 17),
            ('짜장면',       '면',       7000, 20),
            ('짬뽕',         '면',       9000, 21),
            ('간짜장',       '면',       9000, 22),
            ('우동',         '면',       9000, 23),
            ('울면',         '면',      10000, 24),
            ('야끼우동',     '면',      11000, 25),
            ('삼선면',       '면',      13000, 26),
            ('볶음밥',       '밥',       9000, 30),
            ('짬뽕밥',       '밥',      10000, 31),
            ('잡채밥',       '밥',      10000, 32),
            ('중화비빔밥',   '밥',      11000, 33),
            ('야끼밥',       '밥',      11000, 34),
            ('짜장밥',       '밥',       8000, 35),
            ('간1+탕수육',   '1인세트', 19000, 40),
            ('짬1+탕수육',   '1인세트', 19000, 41),
            ('짜1+탕수육',   '1인세트', 17000, 42),
            ('볶1+탕수육',   '1인세트', 19000, 43),
            ('짜2+탕수육',   '2인세트', 24000, 50),
            ('짜+짬+탕수육', '2인세트', 25000, 51),
            ('짬2+탕수육',   '2인세트', 28000, 52),
            ('간2+탕수육',   '2인세트', 28000, 53),
            ('볶2+탕수육',   '2인세트', 28000, 54),
            ('콩국수',       '계절',     8000, 60),
            ('밀면',         '계절',     8000, 61),
            ('소주',         '주류',     4000, 70),
            ('맥주',         '주류',     4000, 71),
            ('고량주',       '주류',     6000, 72),
            ('이과두주',     '주류',     5000, 73),
            ('음료수',       '주류',     2000, 74)
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
