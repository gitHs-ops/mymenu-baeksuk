-- Restaurant QR Order System Database Schema
-- MySQL Database for Railway

-- Create database (Railway usually creates this automatically)
CREATE DATABASE IF NOT EXISTS railway CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE railway;

-- Orders table
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

-- Order items table
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

-- Staff calls table
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Menu items table (optional - for menu management)
CREATE TABLE IF NOT EXISTS menu_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    category VARCHAR(50) NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    is_available BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_category (category),
    INDEX idx_is_available (is_available)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert sample menu items
INSERT INTO menu_items (name, category, price) VALUES
-- 탕수육
('탕수육 (소)', '탕수육', 15000),
('탕수육 (중)', '탕수육', 20000),
('탕수육 (대)', '탕수육', 25000),
('탕수육 (특)', '탕수육', 30000),

-- 요리
('양장피', '요리', 50000),
('팔보채', '요리', 50000),
('깐풍육', '요리', 40000),
('라조육', '요리', 40000),
('깐쇼새우', '요리', 24000),
('깐쇼팔보', '요리', 26000),
('짬짜면', '요리', 10000),
('군만두', '요리', 6000),

-- 면
('짜장면', '면', 7000),
('짬뽕', '면', 9000),
('간짜장', '면', 9000),
('우동', '면', 9000),
('울면', '면', 10000),
('야끼우동', '면', 11000),
('삼선면', '면', 13000),

-- 밥
('볶음밥', '밥', 9000),
('짬뽕밥', '밥', 10000),
('잡채밥', '밥', 10000),
('중화비빔밥', '밥', 11000),
('야끼밥', '밥', 11000),
('짜장밥', '밥', 8000),

-- 세트메뉴
('짬1+탕수육', '세트메뉴', 19000),
('짜1+탕수육', '세트메뉴', 17000),
('볶1+탕수육', '세트메뉴', 19000),
('짬1+짬+탕수육', '세트메뉴', 24000),
('짬1+짜+탕수육', '세트메뉴', 25000),
('짬2+탕수육', '세트메뉴', 28000),
('짜2+탕수육', '세트메뉴', 28000),
('볶2+탕수육', '세트메뉴', 28000),

-- 추가
('소주', '추가', 4000),
('맥주', '추가', 4000),
('고량주', '추가', 6000),
('이과두주', '추가', 5000),
('음료수', '추가', 2000)
ON DUPLICATE KEY UPDATE price=VALUES(price);

-- Statistics view for dashboard
CREATE OR REPLACE VIEW order_statistics AS
SELECT 
    DATE(created_at) as order_date,
    COUNT(*) as total_orders,
    SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_orders,
    SUM(CASE WHEN status = 'cooking' THEN 1 ELSE 0 END) as cooking_orders,
    SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_orders,
    SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_orders,
    SUM(total) as total_revenue
FROM orders
GROUP BY DATE(created_at)
ORDER BY order_date DESC;

-- Made with Bob
