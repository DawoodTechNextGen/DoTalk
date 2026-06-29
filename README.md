# DoTalk: Real-time PWA Chat Application

DoTalk is a modern, responsive, real-time Progressive Web App (PWA) chat client integrated with a NestJS backend, Cloudinary cloud media storage, and a MySQL database. It supports real-time group and private direct messages, WhatsApp-style quoted replies, inline emojis, push notifications, and detailed group management.

---

## 📂 Project Structure

This project is organized as a monorepo containing both the backend service and the frontend client:

*   **`backend/`**: NestJS application using Socket.io (WebSockets), TypeORM, Passport JWT Auth, and Cloudinary SDK.
*   **`frontend/`**: Vite + React PWA client styled with Tailwind CSS, utilizing Service Workers for offline loading capabilities.
*   **`db_setup.sql`**: SQL database initialization setup.

---

## ✨ Features

1.  **WhatsApp-Style Quoted Replies**: Hover over any chat bubble, click the reply icon, and send a message. The reply is visually quoted above the text inside the message bubble.
2.  **Group Details Panel**: View group metadata, tech stack categories, internship mode categories, group creator, and group members with supervisor/creator badges.
3.  **Supervisor Auto-Assignment**: Setting a technology stack when creating a group automatically searches and adds the assigned stack supervisor as a group participant.
4.  **Creator Group Controls**: Group creators have direct access to safely remove participants from the group details side panel.
5.  **Cloudinary Cloud Media Storage**: Base64 image and file attachments are intercepted, uploaded to Cloudinary, and saved as secure lightweight CDN URLs in the database.
6.  **Progressive Web App (PWA)**: Built-in dark/light mode toggle, mobile-responsive layouts, and full service worker caching support.
7.  **Admin Protection**: Administrative users are filtered out of the sidebar contacts list automatically to prevent direct communication channels with root admins.

---

## 🛠️ Database Setup

Run the following SQL commands on your target database (`dawoodte_task_desk` or equivalent) to create the required tables and columns:

```sql
-- 1. Update technologies to support assigned supervisors
ALTER TABLE `technologies` ADD COLUMN `supervisor_id` INT DEFAULT NULL;
ALTER TABLE `technologies` ADD CONSTRAINT `FK_technologies_supervisor` FOREIGN KEY (`supervisor_id`) REFERENCES `users` (`id`) ON DELETE SET NULL;

-- 2. Create Chat Groups Table
CREATE TABLE IF NOT EXISTS `chat_groups` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `group_name` VARCHAR(255) NOT NULL,
  `tech_id` INT DEFAULT NULL,
  `internship_type` INT DEFAULT NULL,
  `supervisor_id` INT DEFAULT NULL,
  `created_by` INT NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`tech_id`) REFERENCES `technologies` (`id`) ON DELETE SET NULL,
  FOREIGN KEY (`supervisor_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. Create Group Members Relation Link
CREATE TABLE IF NOT EXISTS `chat_group_members` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `group_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  `joined_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`group_id`) REFERENCES `chat_groups` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  UNIQUE KEY `unique_membership` (`group_id`, `user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. Create Messages Table with self-referencing parent replies support
CREATE TABLE IF NOT EXISTS `chat_messages` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `sender_id` INT NOT NULL,
  `receiver_id` INT DEFAULT NULL,
  `group_id` INT DEFAULT NULL,
  `parent_id` INT DEFAULT NULL,
  `message` TEXT DEFAULT NULL,
  `message_type` ENUM('text', 'image', 'file') DEFAULT 'text',
  `file_path` VARCHAR(255) DEFAULT NULL,
  `is_read` TINYINT(1) DEFAULT 0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`sender_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`receiver_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`group_id`) REFERENCES `chat_groups` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`parent_id`) REFERENCES `chat_messages` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5. Create Push Notification Subscriptions Table
CREATE TABLE IF NOT EXISTS `push_subscriptions` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `subscription_json` TEXT NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

---

## 🚀 Getting Started

### 1. Backend Setup
1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Configure `.env` environment variables:
   ```env
   PORT=3000
   DB_HOST=localhost
   DB_PORT=3306
   DB_USERNAME=root
   DB_PASSWORD=your_password
   DB_DATABASE=dawoodte_task_desk
   JWT_SECRET=your_jwt_secret_token
   CLOUDINARY_URL=cloudinary://<api_key>:<api_secret>@<cloud_name>
   ```
3. Install dependencies and start NestJS in development mode:
   ```bash
   pnpm install
   pnpm run start:dev
   ```

### 2. Frontend Setup
1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Configure your API connection keys in `src/config.js` or `.env`.
3. Install dependencies and run development server:
   ```bash
   pnpm install
   pnpm run dev
   ```
4. Build production bundle assets:
   ```bash
   pnpm run build
   ```
   Static output elements are compiled inside the `dist/` directory.
