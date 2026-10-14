import { Asset, Clip, validateClips } from "./timeline";
import { EditingStyle, styleSchema } from "./styles";
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("shorties", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("project");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
export async function saveProject(
  name: string,
  clips: Clip[],
  assets: Asset[],
  ratio = "16:9",
) {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("project", "readwrite");
      tx.objectStore("project").put(
        { name, clips, ratio, assets: assets.map(({ objectUrl, ...a }) => a) },
        "current",
      );
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
export async function loadProject(): Promise<{
  name: string;
  clips: Clip[];
  assets: Asset[];
  ratio: string;
} | null> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const req = db
        .transaction("project")
        .objectStore("project")
        .get("current");
      req.onsuccess = () => {
        try {
          const p = req.result;
          if (!p) return resolve(null);
          validateClips(p.clips);
          resolve({
            ...p,
            ratio: ["16:9", "9:16", "1:1"].includes(p.ratio) ? p.ratio : "16:9",
            assets: p.assets.map((a: Asset) => ({
              ...a,
              objectUrl: URL.createObjectURL(a.file),
            })),
          });
        } catch (e) {
          reject(e);
        }
      };
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}
export async function loadStyles(): Promise<EditingStyle[]> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const req = db
        .transaction("project")
        .objectStore("project")
        .get("styles-v1");
      req.onsuccess = () => {
        try {
          resolve(
            styleSchema
              .array()
              .max(50)
              .parse(req.result ?? []),
          );
        } catch (e) {
          reject(e);
        }
      };
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}
export async function saveStyles(styles: EditingStyle[]) {
  const checked = styleSchema.array().max(50).parse(styles),
    db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("project", "readwrite");
      tx.objectStore("project").put(checked, "styles-v1");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
