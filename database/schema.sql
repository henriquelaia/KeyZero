-- KeyZero — Zero-Knowledge Password Manager
-- Arquitetura: o servidor NUNCA armazena a MasterKey nem a chave de encriptação.
-- O campo auth_hash guarda bcrypt(PBKDF2(masterKey+":auth", salt)) — derivado no cliente.
-- O campo encrypted_password contém os bytes cifrados com AES-GCM — só o cliente os decifra.

CREATE DATABASE IF NOT EXISTS keyzero
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE keyzero;

-- ─── UTILIZADORES ────────────────────────────────────────────────────────────
CREATE TABLE users (
  id          CHAR(36)     NOT NULL,                          -- UUID v4
  email       VARCHAR(255) NOT NULL,
  salt        CHAR(64)     NOT NULL,                          -- 32 bytes aleatórios em hex (gerados no servidor)
  auth_hash   VARCHAR(255) NOT NULL DEFAULT 'pending',        -- bcrypt( PBKDF2(masterKey+":auth", salt) )
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_email (email),
  UNIQUE KEY uq_salt  (salt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── PASSWORDS ───────────────────────────────────────────────────────────────
CREATE TABLE passwords (
  id                 CHAR(36)     NOT NULL,                   -- UUID v4
  user_id            CHAR(36)     NOT NULL,                   -- FK → users.id
  site               VARCHAR(255) NOT NULL,                   -- ex: "github.com"
  username           VARCHAR(255) NOT NULL DEFAULT '',        -- username/email do site
  encrypted_password TEXT         NOT NULL,                   -- JSON: { ct: base64, iv: base64 }
  created_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  CONSTRAINT fk_passwords_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
