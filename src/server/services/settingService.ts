import { db } from "../config/db";

/**
 * 获取指定 Key 的系统设置
 * @param key 设置项的 Key
 * @param defaultValue 默认值
 */
export function getSetting(key: string, defaultValue: string = ""): string {
  try {
    const row = db.prepare("SELECT value FROM system_settings WHERE key = ?").get(key) as { value: string } | undefined;
    return row ? row.value : defaultValue;
  } catch (err) {
    console.error(`Error getting setting ${key}:`, err);
    return defaultValue;
  }
}

/**
 * 保存或更新指定 Key 的系统设置
 * @param key 设置项的 Key
 * @param value 设置项的值
 */
export function setSetting(key: string, value: string): void {
  try {
    db.prepare("INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)").run(key, value);
  } catch (err) {
    console.error(`Error setting ${key}:`, err);
  }
}

/**
 * 获取系统中所有的设置项
 */
export function getSettings(): Record<string, string> {
  try {
    const rows = db.prepare("SELECT key, value FROM system_settings").all() as { key: string, value: string }[];
    const settings: Record<string, string> = {};
    rows.forEach(row => {
      settings[row.key] = row.value;
    });
    return settings;
  } catch (err) {
    console.error("Error getting all settings:", err);
    return {};
  }
}
