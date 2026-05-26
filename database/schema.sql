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
    cleared_at TIMESTAMP NULL,
    INDEX idx_table_number (table_number),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at),
    INDEX idx_cleared_at (cleared_at)
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
-- 메인메뉴
('토종닭 백숙', '메인메뉴', 65000),
('오리 백숙', '메인메뉴', 70000),
('토종옻닭 백숙', '메인메뉴', 70000),
('오리옻 백숙', '메인메뉴', 75000),
('들깨·녹두 닭백숙', '메인메뉴', 70000),
('들깨·녹두 오리백숙', '메인메뉴', 75000),
('오리불고기', '메인메뉴', 45000),
('볶음밥', '메인메뉴', 2000),

-- 특선
('장수탕 닭 또는 오리', '특선', 130000),

-- 추가메뉴
('왕새우 4마리', '추가메뉴', 15000),
('왕홍합 10마리', '추가메뉴', 10000),
('왕우무 1마리', '추가메뉴', 10000),
('전복 4마리', '추가메뉴', 15000),
('가리비 4마리', '추가메뉴', 15000),
('혹 포장', '추가메뉴', 10000),

-- 사이드
('도토리묵무침', '사이드', 12000),

-- 주류
('소주', '주류', 4000),
('맥주', '주류', 4000),
('막걸리', '주류', 4000),
('음료수', '주류', 2000)
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
