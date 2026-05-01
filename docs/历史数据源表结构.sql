/*
 Navicat Premium Dump SQL

 Source Server         : localhostMysql
 Source Server Type    : MySQL
 Source Server Version : 80041 (8.0.41)
 Source Host           : localhost:3306
 Source Schema         : quantifydata

 Target Server Type    : MySQL
 Target Server Version : 80041 (8.0.41)
 File Encoding         : 65001

 Date: 23/03/2026 22:00:43
*/

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- Table structure for dat_1mins
-- ----------------------------
DROP TABLE IF EXISTS `dat_1mins`;
CREATE TABLE `dat_1mins`  (
  `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '自增主键',
  `code` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '股票代码（如000001.SZ）',
  `trade_time` datetime NULL DEFAULT NULL COMMENT '交易时间（精确到分钟）',
  `close` decimal(10, 2) NULL DEFAULT NULL COMMENT '收盘价',
  `open` decimal(10, 2) NULL DEFAULT NULL COMMENT '开盘价',
  `high` decimal(10, 2) NULL DEFAULT NULL COMMENT '最高价',
  `low` decimal(10, 2) NULL DEFAULT NULL COMMENT '最低价',
  `vol` bigint NULL DEFAULT NULL COMMENT '成交量（股数）',
  `amount` decimal(16, 2) NULL DEFAULT NULL COMMENT '成交额（元）',
  `date` date NULL DEFAULT NULL COMMENT '交易日期（格式：YYYYMMDD）',
  `pre_close` decimal(10, 2) NULL DEFAULT NULL COMMENT '前收盘价',
  `change` decimal(10, 2) NULL DEFAULT NULL COMMENT '涨跌额',
  `pct_chg` decimal(10, 2) NULL DEFAULT NULL COMMENT '涨跌幅（%）',
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `uk_code_trade_time`(`code` ASC, `trade_time` ASC) USING BTREE COMMENT '股票代码+交易时间唯一索引',
  INDEX `idx_code_date`(`code` ASC, `date` ASC) USING BTREE COMMENT '股票代码+交易日期索引',
  INDEX `idx_code_date_time`(`code` ASC, `date` ASC, `trade_time` ASC) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 1465090082 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci COMMENT = '股票1分钟K线数据表' ROW_FORMAT = DYNAMIC;

-- ----------------------------
-- Table structure for dat_5mins
-- ----------------------------
DROP TABLE IF EXISTS `dat_5mins`;
CREATE TABLE `dat_5mins`  (
  `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '自增主键',
  `code` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '股票代码（如000001.SZ）',
  `trade_time` datetime NOT NULL COMMENT '交易时间',
  `open` decimal(10, 2) NOT NULL COMMENT '开盘价',
  `high` decimal(10, 2) NOT NULL COMMENT '最高价',
  `low` decimal(10, 2) NOT NULL COMMENT '最低价',
  `close` decimal(10, 2) NOT NULL COMMENT '收盘价',
  `vol` bigint NOT NULL COMMENT '成交量',
  `amount` decimal(16, 2) NOT NULL COMMENT '成交额',
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `uk_code_trade_time`(`code` ASC, `trade_time` ASC) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 245988456 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci COMMENT = '股票5分钟聚合数据表' ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for dat_10mins
-- ----------------------------
DROP TABLE IF EXISTS `dat_10mins`;
CREATE TABLE `dat_10mins`  (
  `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '自增主键',
  `code` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '股票代码（如000001.SZ）',
  `trade_time` datetime NOT NULL COMMENT '交易时间',
  `open` decimal(10, 2) NOT NULL COMMENT '开盘价',
  `high` decimal(10, 2) NOT NULL COMMENT '最高价',
  `low` decimal(10, 2) NOT NULL COMMENT '最低价',
  `close` decimal(10, 2) NOT NULL COMMENT '收盘价',
  `vol` bigint NOT NULL COMMENT '成交量',
  `amount` decimal(16, 2) NOT NULL COMMENT '成交额',
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `uk_code_trade_time`(`code` ASC, `trade_time` ASC) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 127839083 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci COMMENT = '股票10分钟聚合数据表' ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for dat_15mins
-- ----------------------------
DROP TABLE IF EXISTS `dat_15mins`;
CREATE TABLE `dat_15mins`  (
  `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '自增主键',
  `code` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '股票代码（如000001.SZ）',
  `trade_time` datetime NOT NULL COMMENT '交易时间',
  `open` decimal(10, 2) NOT NULL COMMENT '开盘价',
  `high` decimal(10, 2) NOT NULL COMMENT '最高价',
  `low` decimal(10, 2) NOT NULL COMMENT '最低价',
  `close` decimal(10, 2) NOT NULL COMMENT '收盘价',
  `vol` bigint NOT NULL COMMENT '成交量',
  `amount` decimal(16, 2) NOT NULL COMMENT '成交额',
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `uk_code_trade_time`(`code` ASC, `trade_time` ASC) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 88501918 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci COMMENT = '股票15分钟聚合数据表' ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for dat_30mins
-- ----------------------------
DROP TABLE IF EXISTS `dat_30mins`;
CREATE TABLE `dat_30mins`  (
  `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '自增主键',
  `code` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '股票代码（如000001.SZ）',
  `trade_time` datetime NOT NULL COMMENT '交易时间',
  `open` decimal(10, 2) NOT NULL COMMENT '开盘价',
  `high` decimal(10, 2) NOT NULL COMMENT '最高价',
  `low` decimal(10, 2) NOT NULL COMMENT '最低价',
  `close` decimal(10, 2) NOT NULL COMMENT '收盘价',
  `vol` bigint NOT NULL COMMENT '成交量',
  `amount` decimal(16, 2) NOT NULL COMMENT '成交额',
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `uk_code_trade_time`(`code` ASC, `trade_time` ASC) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 49168233 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci COMMENT = '股票30分钟聚合数据表' ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for dat_60mins
-- ----------------------------
DROP TABLE IF EXISTS `dat_60mins`;
CREATE TABLE `dat_60mins`  (
  `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '自增主键',
  `code` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '股票代码（如000001.SZ）',
  `trade_time` datetime NOT NULL COMMENT '交易时间',
  `open` decimal(10, 2) NOT NULL COMMENT '开盘价',
  `high` decimal(10, 2) NOT NULL COMMENT '最高价',
  `low` decimal(10, 2) NOT NULL COMMENT '最低价',
  `close` decimal(10, 2) NOT NULL COMMENT '收盘价',
  `vol` bigint NOT NULL COMMENT '成交量',
  `amount` decimal(16, 2) NOT NULL COMMENT '成交额',
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `uk_code_trade_time`(`code` ASC, `trade_time` ASC) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 29500641 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci COMMENT = '股票60分钟聚合数据表' ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for dat_day
-- ----------------------------
DROP TABLE IF EXISTS `dat_day`;
CREATE TABLE `dat_day`  (
  `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '自增主键',
  `code` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '股票代码（如000001.SZ）',
  `trade_time` datetime NOT NULL COMMENT '交易时间',
  `open` decimal(10, 2) NOT NULL COMMENT '开盘价',
  `high` decimal(10, 2) NOT NULL COMMENT '最高价',
  `low` decimal(10, 2) NOT NULL COMMENT '最低价',
  `close` decimal(10, 2) NOT NULL COMMENT '收盘价',
  `vol` bigint NOT NULL COMMENT '成交量',
  `amount` decimal(16, 2) NOT NULL COMMENT '成交额',
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `uk_code_trade_time`(`code` ASC, `trade_time` ASC) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 4917024 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci COMMENT = '股票日线聚合数据表' ROW_FORMAT = Dynamic;

SET FOREIGN_KEY_CHECKS = 1;
