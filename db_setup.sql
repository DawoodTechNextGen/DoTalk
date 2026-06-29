-- Database creation
CREATE DATABASE IF NOT EXISTS `task_management`;
USE `task_management`;

-- Create Technologies table if not exists
CREATE TABLE IF NOT EXISTS `technologies` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Create Users table if not exists
CREATE TABLE IF NOT EXISTS `users` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(255) NOT NULL,
  `email` VARCHAR(255) NOT NULL UNIQUE,
  `password` VARCHAR(255) NOT NULL,
  `user_role` VARCHAR(100) DEFAULT 'user',
  `supervisor_id` INT DEFAULT NULL,
  `tech_id` INT DEFAULT NULL,
  FOREIGN KEY (`tech_id`) REFERENCES `technologies` (`id`) ON DELETE SET NULL,
  FOREIGN KEY (`supervisor_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 1. Create Chat Groups Table
CREATE TABLE IF NOT EXISTS `chat_groups` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `group_name` VARCHAR(255) NOT NULL,
  `tech_id` INT DEFAULT NULL,
  `created_by` INT NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`tech_id`) REFERENCES `technologies` (`id`) ON DELETE SET NULL,
  FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. Create Group Members Table
CREATE TABLE IF NOT EXISTS `chat_group_members` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `group_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  `joined_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`group_id`) REFERENCES `chat_groups` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  UNIQUE KEY `unique_membership` (`group_id`, `user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. Create Messages Table
CREATE TABLE IF NOT EXISTS `chat_messages` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `sender_id` INT NOT NULL,
  `receiver_id` INT DEFAULT NULL,
  `group_id` INT DEFAULT NULL,
  `message` TEXT DEFAULT NULL,
  `message_type` ENUM('text', 'image', 'file') DEFAULT 'text',
  `file_path` VARCHAR(255) DEFAULT NULL,
  `is_read` TINYINT(1) DEFAULT 0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`sender_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`receiver_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`group_id`) REFERENCES `chat_groups` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. Create Push Notification Subscriptions Table
CREATE TABLE IF NOT EXISTS `push_subscriptions` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `subscription_json` TEXT NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Insert Mock Data for testing if tables are empty
INSERT INTO `technologies` (`id`, `name`) 
SELECT 1, 'React' WHERE NOT EXISTS (SELECT 1 FROM `technologies` WHERE `id` = 1);

INSERT INTO `technologies` (`id`, `name`) 
SELECT 2, 'NestJS' WHERE NOT EXISTS (SELECT 1 FROM `technologies` WHERE `id` = 2);

-- Insert dummy users if empty (password is bcrypt hashed of "password123")
INSERT INTO `users` (`name`, `email`, `password`, `user_role`, `tech_id`)
SELECT 'John Doe', 'john@example.com', '$2b$10$E4/5zjdYRi2kTMJrEhnV1OrUQUXKpfyLny5mO1R4aTugdrNYb8xwu', 'admin', 1
WHERE NOT EXISTS (SELECT 1 FROM `users` WHERE `email` = 'john@example.com');

INSERT INTO `users` (`name`, `email`, `password`, `user_role`, `tech_id`)
SELECT 'Jane Smith', 'jane@example.com', '$2b$10$E4/5zjdYRi2kTMJrEhnV1OrUQUXKpfyLny5mO1R4aTugdrNYb8xwu', 'user', 2
WHERE NOT EXISTS (SELECT 1 FROM `users` WHERE `email` = 'jane@example.com');
