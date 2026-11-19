// ============================================================================
// CREATA MUEBLES — PROYECTO B: GENERACIÓN DE PROMPTS (BUENA-ESPERO) + ALTA ODOO
// Apps Script Independiente para "Base de Datos Generales"
//
// AISLAMIENTO ESTRICTO DE CARPETAS Y HOJAS:
//   - Hoja exclusiva: Base de Datos Generales (1ZCLZppO5AH06Wp2gVuxMoaeX3oJwVHgTjRZ7hlqb6eg)
//   - Bandeja exclusiva Prompts: SUBIR PROPT (1Xc-gaDUJHNSd_XSTob3b39CNYoC9UreX)
//   - Buzón / Final Odoo: SUBIDA DE FOTOS (1rwRk...) -> fotos odoo (1lfq8...)
//   - Muestras solo lectura: TELAS (1JKJP...) y MADERAS (1Jq2u...)
//   - PROHIBIDO tocar Proyecto A: SUBIR PREN (11_rR...), CATEGORIAS MUEBLES Y
//     ACCESORIOS (1KZh-Az...) + 10 subcarpetas, FOTOS NUEVAS CARGADO,
//     Control de Productos (1xewq...) y LPPT (1t78K...).
// ============================================================================

const PROMPTS_PROJECT_TAG_ = 'prompts_odoo';
const PROMPTS_SHEET_ID_ = '1ZCLZppO5AH06Wp2gVuxMoaeX3oJwVHgTjRZ7hlqb6eg'; // Base de Datos Generales
const PROMPTS_CONFIG_TAB_ = '_PROMPTS_CONFIG';

// Carpetas exclusivas de Proyecto B (Prompts IA + Alta de Odoo)
const SUBIR_PROPT_FOLDER_ID_ = '1Xc-gaDUJHNSd_XSTob3b39CNYoC9UreX';       // SUBIR PROPT (exclusivo Prompts)
const BUZON_ODOO_FOLDER_ID_ = '1rwRk-bZtb8m4Hso9pCJE1A0_QiS-rqUQ';        // SUBIDA DE FOTOS (Buzón Odoo)
const FOTOS_ODOO_FINAL_FOLDER_ID_ = '1lfq8VBF1q-Kg9m6_qd2GU5zxwEywYw_B';  // fotos odoo (Final Odoo)
const FOTOS_ODOO_SUBFOLDERS_ = {
  MUEBLES:    { key: 'MUEBLES',    id: '10UIhDWLKL0ySmzdcMemA5K5831YozuBa', name: 'FOTOS MUEBLES' },
  ACCESORIOS: { key: 'ACCESORIOS', id: '1z-Ne0hBzXIi1dTfJOxtz1kUUPYQQNpTR', name: 'FOTOS ACCESORIOS Y ESPEJOS' },
  TELAS:      { key: 'TELAS',      id: '12gsKZVs6rFonOO8CIxokuE73bxhq8tS9', name: 'FOTOS TELAS' },
  OTROS:      { key: 'OTROS',      id: '13inkyy1ZfGn7yD0ceSr6RSMquaA3OBO1', name: 'OTROS' }
};
const TELAS_FOLDER_ID_ = '1JKJPXcnPFPeoUOo_mBIUyl_KXM0Fn3Ul';            // TELAS (solo lectura)
const MADERAS_FOLDER_ID_ = '1Jq2u1A6-xKi1YigUYSIzLauUww_RJ5Lx';          // MADERAS (solo lectura)

// Lista negra dura de IDs de Proyecto A (Cotizador / App #9 Subida de Fotos)
const FORBIDDEN_PROJECT_A_IDS_ = {
  '11_rR-qhgM02Sfx9zw7uHU5AwXvTpKD4p': 'SUBIR PREN (exclusivo Proyecto A)',
  '1KZh-AzOejRbz9TdHYF52yaiuejPtT-sN': 'CATEGORIAS MUEBLES Y ACCESORIOS (exclusivo Proyecto A)',
  '1xo2z2bIE_HCscBiqFI8Ew-KhQacBElsb': 'FOTOS SALAS (exclusivo Proyecto A)',
  '1zqGnweu7T5-9f6dQoVXuT9MZTBPefSNm': 'FOTOS SILLONES (exclusivo Proyecto A)',
  '1nU1UgT78XiGo-OLrV4tIrxNKxy9CTd8_': 'FOTOS SOFA CAMA Y FUTTONES (exclusivo Proyecto A)',
  '1-KcgtpX7hVbsxFsejewVY7QT95Jzno_A': 'FOTOS MESA DE CENTRO (exclusivo Proyecto A)',
  '1oRW0Mtpc7tKvDZjfrq4VCwhA332fV1lX': 'FOTOS MESA LATERALES (exclusivo Proyecto A)',
  '1iaZaA1TXcGVL9WABWi656Xouzviiog6K': 'FOTOS COMEDORES (exclusivo Proyecto A)',
  '1LyU1n-4SsuJTuchYQmGYHRpcdu0gh2i6': 'FOTOS RECAMARAS (exclusivo Proyecto A)',
  '1peDTq6kj9iPZaxxYUId0Jw-MJmQN4aJ8': 'FOTOS DE AUXILIARES (exclusivo Proyecto A)',
  '13mOw-BpuZSYpD55qPangEEXWuWW-1OL9': 'FOTOS ACCESORIOS Y ESPEJOS (exclusivo Proyecto A)',
  '1mo5gn59M0m-psn0f6o9B1OtUHeCpz3S9': 'FOTOS INTERIOR (exclusivo Proyecto A)',
  '1rPFbjvovC5fSDPHS29yYpbLwM90c-5L9': 'FOTOS NUEVAS CARGADO (exclusivo Proyecto A)',
  '1xewqWPOlR5LMEFQXq1KsqvObg9PPlTkRGqfZ_4Iiv-8': 'Control de Productos (Sheet exclusivo Proyecto A)',
  '1t78KDg_DMbGfauNWRrjUc3ULh-SzrxO9XwOHPrtJtWE': 'LPPT Proveedores (solo lectura Proyecto A)'
};

const DEFAULT_PROMPTS_OWNER_EMAIL_ = 'kevin.reyna@grupoanipa.com';
const MAX_PROMPTS_UPLOAD_BYTES_ = 15 * 1024 * 1024; // 15 MB
const ALLOWED_IMAGE_MIME_TYPES_ = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/bmp': 'bmp'
};

// Protección estricta de filas y fórmulas en "Base de Datos Generales"
// Fila 1-2 = encabezados, Fila 3 = fórmulas maestras ARRAYFORMULA / MAP / LET (NUNCA TOCAR)
const DATOS_GENERAL_MIN_DATA_ROW_ = 4;
const FOTOS_NORM_MIN_DATA_ROW_ = 4;

// Columnas manuales permitidas (1-based) en DATOS GENERAL:
// A(1), C:N(3..14), P(16), X:Z(24..26), AA(27), AC(29), AD(30), AF(32), AG(33), AI(35), AJ(36), AL(38), AM(39)
// Bloqueadas (fórmulas): B(2), O(15), Q:W(17..23), AB(28), AE(31), AH(34), AK(37), AN:AZ(40..52)
const DATOS_GENERAL_MANUAL_COLS_ = {
  1: 'A',
  3: 'C', 4: 'D', 5: 'E', 6: 'F', 7: 'G', 8: 'H', 9: 'I',
  10: 'J', 11: 'K', 12: 'L', 13: 'M', 14: 'N',
  16: 'P',
  24: 'X', 25: 'Y', 26: 'Z',
  27: 'AA', 29: 'AC',
  30: 'AD', 32: 'AF',
  33: 'AG', 35: 'AI',
  36: 'AJ', 38: 'AL',
  39: 'AM'
};

const DATOS_GENERAL_FIELD_TO_COL_ = {
  sku: 1,
  frente: 3,
  fondo: 4,
  alto: 5,
  diametro: 6,
  piso_asiento: 7,
  peso_kg: 8,
  metro_3: 9,
  frente_empaque: 10,
  fondo_empaque: 11,
  alto_empaque: 12,
  peso_empaque: 13,
  metro_cubico: 14,
  categoria: 16,
  modelo: 24,
  tipo_mueble: 25,
  nombre_nuevo: 26,
  foto_mueble_nom: 27,
  foto_mueble_link: 29,
  foto_tela_nom: 30,
  foto_tela_link: 32,
  foto_madera_nom: 33,
  foto_madera_link: 35,
  foto_swatch_nom: 36,
  foto_swatch_link: 38,
  bultos: 39
};

// Columnas de enlaces en DATOS GENERAL (validación estricta https://)
const DATOS_GENERAL_LINK_COLS_ = {
  29: 'AC',
  32: 'AF',
  35: 'AI',
  38: 'AL'
};

// Columnas de datos exactas (1-based) en FOTOS NORMALIZADAS (verificadas en vivo):
// MUEBLE -> B(2)/D(4), TELA -> F(6)/H(8), MADERA -> J(10)/L(12), SWATCH -> N(14)/P(16)
// PROHIBIDO escribir en C(3), G(7), K(11), O(15) (=MAP(...IMAGE(...)))
const FOTOS_NORM_BLOCKS_ = {
  MUEBLE: { tipo: 'MUEBLE', nameCol: 2, linkCol: 4, formulaCol: 3, datosNomCol: 27, datosLinkCol: 29 },
  TELA:   { tipo: 'TELA',   nameCol: 6, linkCol: 8, formulaCol: 7, datosNomCol: 30, datosLinkCol: 32 },
  MADERA: { tipo: 'MADERA', nameCol: 10, linkCol: 12, formulaCol: 11, datosNomCol: 33, datosLinkCol: 35 },
  SWATCH: { tipo: 'SWATCH', nameCol: 14, linkCol: 16, formulaCol: 15, datosNomCol: 36, datosLinkCol: 38 }
};

const PAYLOAD_ID_FIELDS_TO_GUARD_ = [
  'fileId',
  'driveFileId',
  'folderId',
  'destFolderId',
  'targetFolderId',
  'targetSubfolder',
  'subfolderKey',
  'sheetId',
  'spreadsheetId'
];

// ============================================================================
// GUARDIAS DE AISLAMIENTO PROYECTO B <-> PROYECTO A
// ============================================================================
function isForbiddenProjectAId_(id) {
  const clean = String(id || '').trim();
  return !!(clean && Object.prototype.hasOwnProperty.call(FORBIDDEN_PROJECT_A_IDS_, clean));
}

function assertNotForbiddenProjectAId_(id, contextLabel) {
  const clean = String(id || '').trim();
  if (isForbiddenProjectAId_(clean)) {
    throw new Error(
      'Aislamiento Proyecto A/B: acceso bloqueado al recurso de Proyecto A "' +
      FORBIDDEN_PROJECT_A_IDS_[clean] + '" (' + clean + ') en ' + String(contextLabel || 'operación') + '.'
    );
  }
}

function validateNoForbiddenProjectAIdsInPayload_(payload, contextLabel) {
  if (!payload || typeof payload !== 'object') return null;
  for (let i = 0; i < PAYLOAD_ID_FIELDS_TO_GUARD_.length; i++) {
    const field = PAYLOAD_ID_FIELDS_TO_GUARD_[i];
    if (payload[field] === undefined || payload[field] === null) continue;
    const raw = String(payload[field]).trim();
    if (raw && isForbiddenProjectAId_(raw)) {
      return {
        ok: false,
        project: PROMPTS_PROJECT_TAG_,
        forbiddenFolder: true,
        field: field,
        error: 'Aislamiento Proyecto A/B: acceso bloqueado al recurso de Proyecto A "' +
          FORBIDDEN_PROJECT_A_IDS_[raw] + '" (' + raw + ') en ' + String(contextLabel || 'operación') + ' (' + field + ').'
      };
    }
  }
  return null;
}

function isFolderOrAncestorForbiddenProjectA_(folderObj, maxDepth) {
  if (!folderObj) return false;
  const limit = (typeof maxDepth === 'number' && maxDepth > 0) ? Math.floor(maxDepth) : 8;
  const visited = {};
  const queue = [{ folder: folderObj, depth: 0 }];
  while (queue.length > 0) {
    const item = queue.shift();
    const cur = item.folder;
    const depth = item.depth;
    if (!cur) continue;
    let fid = '';
    try {
      fid = String((cur.getId && cur.getId()) || '').trim();
    } catch (eId) {
      return true; // Fail closed
    }
    if (isForbiddenProjectAId_(fid)) return true;
    if (fid) {
      if (visited[fid]) continue;
      visited[fid] = true;
    }
    if (depth >= limit) continue;
    try {
      const pIt = cur.getParents && cur.getParents();
      while (pIt && pIt.hasNext()) {
        const pf = pIt.next();
        if (pf) queue.push({ folder: pf, depth: depth + 1 });
      }
    } catch (eWalk) {
      return true; // Fail closed if getParents() throws
    }
  }
  return false;
}

function isFileInForbiddenProjectAFolder_(file) {
  if (!file) return false;
  try {
    const fid = String((file.getId && file.getId()) || '').trim();
    if (isForbiddenProjectAId_(fid)) return true;
    const mime = String((file.getMimeType && file.getMimeType()) || '').toLowerCase();
    if (mime === 'application/vnd.google-apps.shortcut') {
      const targetId = String((file.getTargetId && file.getTargetId()) || '').trim();
      if (!targetId || isForbiddenProjectAId_(targetId)) return true;
      const targetFile = DriveApp.getFileById(targetId);
      if (!targetFile) return true;
      const tParents = targetFile.getParents();
      while (tParents && tParents.hasNext()) {
        if (isFolderOrAncestorForbiddenProjectA_(tParents.next(), 8)) return true;
      }
    }
    const pIt = file.getParents();
    while (pIt && pIt.hasNext()) {
      const pf = pIt.next();
      if (isFolderOrAncestorForbiddenProjectA_(pf, 8)) return true;
    }
  } catch (ePar) {
    return true; // Fail closed if getParents() throws
  }
  return false;
}

function getFileParentIds_(file) {
  const ids = [];
  if (!file || !file.getParents) return ids;
  try {
    const pIt = file.getParents();
    while (pIt && pIt.hasNext()) {
      const pf = pIt.next();
      const pid = String((pf && pf.getId && pf.getId()) || '').trim();
      if (pid) ids.push(pid);
    }
  } catch (eP) {}
  return ids;
}

function assertFileBelongsToAllowedFolders_(file, allowedFolderIds, contextLabel) {
  if (!file) {
    throw new Error('Archivo no encontrado para ' + String(contextLabel || 'operación') + '.');
  }
  if (isFileInForbiddenProjectAFolder_(file)) {
    throw new Error(
      'Aislamiento Proyecto A/B: el archivo pertenece a una carpeta exclusiva de Proyecto A (SUBIR PREN / CATEGORIAS / FOTOS NUEVAS CARGADO) y no puede ser modificado desde Prompts/Odoo.'
    );
  }
  const allowSet = {};
  for (let i = 0; i < (allowedFolderIds || []).length; i++) {
    const aid = String(allowedFolderIds[i] || '').trim();
    if (aid && !isForbiddenProjectAId_(aid)) allowSet[aid] = true;
  }
  const parents = getFileParentIds_(file);
  for (let j = 0; j < parents.length; j++) {
    if (allowSet[parents[j]]) return parents[j];
  }
  throw new Error(
    'Aislamiento Proyecto B: el archivo (' + String(file.getId ? file.getId() : '') +
    ') no pertenece a las carpetas permitidas para ' + String(contextLabel || 'esta acción') + '.'
  );
}

function getSafeFolderById_(folderId, contextLabel) {
  const cleanId = String(folderId || '').trim();
  if (!cleanId) throw new Error('ID de carpeta vacío en ' + String(contextLabel || 'Drive') + '.');
  assertNotForbiddenProjectAId_(cleanId, contextLabel);
  return DriveApp.getFolderById(cleanId);
}

function getPromptsSpreadsheet_() {
  assertNotForbiddenProjectAId_(PROMPTS_SHEET_ID_, 'getPromptsSpreadsheet_');
  try {
    const active = SpreadsheetApp.getActiveSpreadsheet();
    if (active && String(active.getId() || '').trim() === PROMPTS_SHEET_ID_) {
      return active;
    }
  } catch (eAct) {}
  return SpreadsheetApp.openById(PROMPTS_SHEET_ID_);
}

// ============================================================================
// UTILIDADES, AUTENTICACIÓN Y RESPUESTA HTTP CORS-SAFE
// ============================================================================
function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function normalizeEmail_(raw) {
  return String(raw || '').trim().toLowerCase().replace(/,/g, '.');
}

function getConfiguredOwnerEmail_() {
  try {
    const props = PropertiesService.getScriptProperties();
    const custom = normalizeEmail_(props && props.getProperty('OWNER_EMAIL'));
    if (custom) return custom;
  } catch (eProp) {}
  return DEFAULT_PROMPTS_OWNER_EMAIL_;
}

function getConfiguredPromptsPin_() {
  try {
    const props = PropertiesService.getScriptProperties();
    return String((props && props.getProperty('PROMPTS_PIN')) || '').trim();
  } catch (eProp) {}
  return '';
}

function getAllowedOwnerEmails_() {
  const primary = getConfiguredOwnerEmail_();
  const allowed = {};
  if (primary) allowed[primary] = true;
  try {
    const props = PropertiesService.getScriptProperties();
    const extra = String((props && props.getProperty('ALLOWED_OWNER_EMAILS')) || '').trim();
    if (extra) {
      const parts = extra.split(/[;\n]+/);
      for (let i = 0; i < parts.length; i++) {
        const norm = normalizeEmail_(parts[i]);
        if (norm) allowed[norm] = true;
      }
    }
  } catch (eProp) {}
  return allowed;
}

function verifyPromptsOwnerAuth_(payload) {
  const body = payload || {};
  const expectedOwner = getConfiguredOwnerEmail_();
  const allowedEmails = getAllowedOwnerEmails_();
  const expectedPin = getConfiguredPromptsPin_();

  const providedEmail = normalizeEmail_(body.ownerEmail || body.email || body.correo || '');
  let activeEmail = '';
  try {
    if (typeof Session !== 'undefined' && Session.getActiveUser) {
      activeEmail = normalizeEmail_(Session.getActiveUser().getEmail());
    }
  } catch (eSess) {}

  const isSameOwnerSession = !!(activeEmail && Object.prototype.hasOwnProperty.call(allowedEmails, activeEmail));

  if (providedEmail && !Object.prototype.hasOwnProperty.call(allowedEmails, providedEmail)) {
    return {
      ok: false,
      authRequired: true,
      forbidden: true,
      error: 'Acceso denegado: operación autorizada únicamente para ' + expectedOwner + '.'
    };
  }

  const emailMatched = (providedEmail && Object.prototype.hasOwnProperty.call(allowedEmails, providedEmail)) ||
    (!providedEmail && isSameOwnerSession);

  if (!emailMatched) {
    return {
      ok: false,
      authRequired: true,
      forbidden: true,
      error: 'Acceso denegado: operación autorizada únicamente para ' + expectedOwner + '.'
    };
  }

  // Ejecución interna del titular desde Google Sheets (menú/editor)
  if (isSameOwnerSession) {
    if (expectedPin && (body.pin !== undefined || body.promptsPin !== undefined)) {
      const providedPinSess = String(body.pin || body.promptsPin || '').trim();
      if (providedPinSess && providedPinSess !== expectedPin) {
        return {
          ok: false,
          authRequired: true,
          forbidden: true,
          error: 'PIN inválido para ejecutar operaciones de Prompts/Odoo.'
        };
      }
    }
    return { ok: true, ownerEmail: activeEmail || expectedOwner, authMode: 'session' };
  }

  // Llamadas externas al Web App (GitHub Pages / clientes externos):
  // Exigir PROMPTS_PIN configurado en ScriptProperties (fail closed si falta)
  if (!expectedPin) {
    return {
      ok: false,
      authRequired: true,
      pinSetupRequired: true,
      forbidden: true,
      error: 'Configura PROMPTS_PIN desde el menú CREATA Prompts & Odoo → Configurar PIN en Base de Datos Generales para habilitar acceso externo seguro.'
    };
  }

  const providedPin = String(body.pin || body.promptsPin || '').trim();
  if (!providedPin || providedPin !== expectedPin) {
    return {
      ok: false,
      authRequired: true,
      forbidden: true,
      error: 'PIN inválido o faltante para ejecutar operaciones de Prompts/Odoo.'
    };
  }

  return { ok: true, ownerEmail: providedEmail || expectedOwner, authMode: 'pin' };
}

function parseRequestPayload_(e) {
  const payload = {};
  if (e && e.parameter && typeof e.parameter === 'object') {
    const keys = Object.keys(e.parameter);
    for (let i = 0; i < keys.length; i++) {
      payload[keys[i]] = e.parameter[keys[i]];
    }
  }
  if (e && e.postData && typeof e.postData.contents === 'string' && e.postData.contents.trim()) {
    const parsed = JSON.parse(e.postData.contents);
    if (parsed && typeof parsed === 'object') {
      const pKeys = Object.keys(parsed);
      for (let j = 0; j < pKeys.length; j++) {
        payload[pKeys[j]] = parsed[pKeys[j]];
      }
    }
  }
  return payload;
}

function colLetterToIndex_(colRef) {
  if (typeof colRef === 'number' && isFinite(colRef)) {
    return Math.floor(colRef);
  }
  const s = String(colRef || '').trim().toUpperCase();
  if (!s) return 0;
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  if (!/^[A-Z]{1,3}$/.test(s)) return 0;
  let num = 0;
  for (let i = 0; i < s.length; i++) {
    num = num * 26 + (s.charCodeAt(i) - 64);
  }
  return num;
}

function colIndexToLetter_(index) {
  let n = Math.floor(Number(index) || 0);
  if (n < 1) return '';
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function formatDriveFileMeta_(file, folderId) {
  const fid = String(file.getId() || '').trim();
  const name = String(file.getName() || '').trim();
  const mime = String(file.getMimeType() || '').toLowerCase();
  const updated = file.getLastUpdated ? file.getLastUpdated() : null;
  return {
    id: fid,
    name: name,
    mimeType: mime.indexOf('image/') === 0 ? mime : 'image/jpeg',
    sizeBytes: Number((file.getSize && file.getSize()) || 0) || 0,
    updatedAt: updated && updated.toISOString ? updated.toISOString() : '',
    viewUrl: 'https://drive.google.com/file/d/' + fid + '/view?usp=sharing',
    thumbUrl: 'https://lh3.googleusercontent.com/d/' + fid + '=w800',
    cdnUrl: 'https://lh3.googleusercontent.com/d/' + fid + '=s2054',
    folderId: String(folderId || '').trim()
  };
}

function isImageDriveFile_(file) {
  if (!file || (file.isTrashed && file.isTrashed())) return false;
  const mime = String((file.getMimeType && file.getMimeType()) || '').toLowerCase();
  const name = String((file.getName && file.getName()) || '').trim();
  return mime.indexOf('image/') === 0 || /\.(jpe?g|png|webp|gif|avif|bmp|heic|heif|tiff?)$/i.test(name);
}

function resolveSafeImageFileForProjectB_(fileObj, checkMultiParent) {
  if (!fileObj || (fileObj.isTrashed && fileObj.isTrashed())) return null;
  let f = fileObj;
  let mime = String((f.getMimeType && f.getMimeType()) || '').toLowerCase();
  if (mime === 'application/vnd.google-apps.shortcut') {
    try {
      const targetId = String((f.getTargetId && f.getTargetId()) || '').trim();
      if (!targetId || isForbiddenProjectAId_(targetId)) return null;
      const targetFile = DriveApp.getFileById(targetId);
      if (!targetFile || (targetFile.isTrashed && targetFile.isTrashed())) return null;
      if (isFileInForbiddenProjectAFolder_(targetFile)) return null;
      f = targetFile;
      mime = String((f.getMimeType && f.getMimeType()) || '').toLowerCase();
      if (mime === 'application/vnd.google-apps.shortcut') return null;
    } catch (eSc) {
      return null;
    }
  }
  if (!isImageDriveFile_(f)) return null;
  if (checkMultiParent && isFileInForbiddenProjectAFolder_(f)) return null;
  return f;
}

function listImagesInFolderById_(folderObj, opts) {
  const folderId = String(folderObj.getId() || '').trim();
  assertNotForbiddenProjectAId_(folderId, 'listImagesInFolderById_');
  const checkMultiParent = (opts && typeof opts.checkMultiParent === 'boolean') ? opts.checkMultiParent : true;
  const items = [];
  const seenIds = {};
  const it = folderObj.getFiles();
  while (it && it.hasNext()) {
    const rawFile = it.next();
    try {
      const f = resolveSafeImageFileForProjectB_(rawFile, checkMultiParent);
      if (!f) continue;
      const fid = String(f.getId() || '').trim();
      if (!fid || seenIds[fid]) continue;
      seenIds[fid] = true;
      items.push(formatDriveFileMeta_(f, folderId));
    } catch (eItem) {}
  }
  items.sort(function (a, b) {
    const cmpDate = String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
    if (cmpDate !== 0) return cmpDate;
    const cmpName = String(a.name || '').localeCompare(String(b.name || ''), 'es');
    if (cmpName !== 0) return cmpName;
    return String(a.id || '').localeCompare(String(b.id || ''));
  });
  return items;
}

function countImagesInFolder_(folderObj, opts) {
  const folderId = String((folderObj && folderObj.getId && folderObj.getId()) || '').trim();
  if (folderId) assertNotForbiddenProjectAId_(folderId, 'countImagesInFolder_');
  const checkMultiParent = (opts && typeof opts.checkMultiParent === 'boolean') ? opts.checkMultiParent : true;
  let count = 0;
  const it = folderObj.getFiles();
  while (it && it.hasNext()) {
    const rawFile = it.next();
    try {
      const f = resolveSafeImageFileForProjectB_(rawFile, checkMultiParent);
      if (f) count++;
    } catch (eC) {}
  }
  return count;
}

function sanitizeUploadFilename_(rawFileName, ext, defaultPrefix) {
  const safeExt = String(ext || 'jpg').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'jpg';
  const prefix = String(defaultPrefix || 'subir_propt').replace(/[^a-zA-Z0-9_-]/g, '_') || 'subir_propt';
  let cleaned = String(rawFileName || '')
    .replace(/(?:^|[\\/])\.\.(?=[\\/]|$)/g, ' ')
    .replace(/\.\.+/g, '.')
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/[\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  cleaned = cleaned.replace(/^[.\s]+/, '').replace(/[.\s]+$/, '');
  const extMatch = cleaned.match(/^(.*)\.(jpe?g|png|webp|gif|avif|bmp)$/i);
  let baseName = extMatch ? String(extMatch[1] || '').trim() : cleaned;
  const finalExt = extMatch ? String(extMatch[2] || safeExt).toLowerCase() : safeExt;
  baseName = baseName.replace(/^[.\s]+|[.\s]+$/g, '');
  if (!baseName) {
    return prefix + '_' + Date.now() + '.' + finalExt;
  }
  return baseName + '.' + finalExt;
}

function parseAndValidateImageUpload_(payload, defaultPrefix) {
  const dataUrl = String((payload && payload.dataUrl) || '').trim();
  const match = dataUrl.match(/^data:([a-zA-Z0-9.+\-\/]+);base64,([A-Za-z0-9+/=\s]+)$/);
  if (!match) {
    return { ok: false, error: 'Formato dataUrl inválido. Se requiere una imagen codificada en base64.' };
  }
  const mime = String(match[1] || '').toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(ALLOWED_IMAGE_MIME_TYPES_, mime)) {
    return {
      ok: false,
      error: 'Tipo MIME no permitido (' + mime + '). Solo se aceptan imágenes (JPG, PNG, WEBP, GIF, AVIF, BMP).'
    };
  }
  const cleanB64 = String(match[2] || '').replace(/\s+/g, '');
  const bytes = Utilities.base64Decode(cleanB64);
  if (!bytes || !bytes.length) {
    return { ok: false, error: 'La imagen está vacía.' };
  }
  if (bytes.length > MAX_PROMPTS_UPLOAD_BYTES_) {
    return {
      ok: false,
      error: 'La imagen excede el tamaño máximo permitido de ' + Math.round(MAX_PROMPTS_UPLOAD_BYTES_ / (1024 * 1024)) + ' MB.'
    };
  }
  const ext = ALLOWED_IMAGE_MIME_TYPES_[mime];
  const finalName = sanitizeUploadFilename_(payload && payload.fileName, ext, defaultPrefix);
  const blob = Utilities.newBlob(bytes, mime, finalName);
  return { ok: true, blob: blob, mime: mime, fileName: finalName, sizeBytes: bytes.length };
}

function resolveWebAppUrl_() {
  try {
    if (typeof ScriptApp !== 'undefined' && ScriptApp.getService) {
      const u = String(ScriptApp.getService().getUrl() || '').trim();
      if (u) return u;
    }
  } catch (eSvc) {}
  try {
    const props = PropertiesService.getScriptProperties();
    const saved = String((props && props.getProperty('PROMPTS_WEBAPP_URL')) || '').trim();
    if (saved) return saved;
  } catch (eP) {}
  return '';
}

function normalizeSkuForMatch_(sku) {
  return String(sku || '').trim().toUpperCase().replace(/[\s\-_]+/g, '');
}

function formatMedidasFromDatosGeneral_(frente, fondo, alto, diametro, pisoAsiento) {
  const cleanVal = function (v) {
    const s = String(v === null || v === undefined ? '' : v).trim();
    if (!s || /^n\/?a$/i.test(s) || s === '-') return '';
    return s;
  };
  const d = cleanVal(diametro);
  const fr = cleanVal(frente);
  const fo = cleanVal(fondo);
  const al = cleanVal(alto);
  const pa = cleanVal(pisoAsiento);

  if (d && !fr && !fo) {
    const partsD = ['D. ' + d];
    if (al) partsD.push('Alto ' + al);
    if (pa) partsD.push('Asiento ' + pa);
    return partsD.join(' x ') + ' cm';
  }
  const dims = [];
  if (fr) dims.push(fr);
  if (fo) dims.push(fo);
  if (al) dims.push(al);
  if (pa) dims.push('asiento ' + pa);
  if (dims.length) {
    return dims.join(' x ') + ' cm' + (d ? (' (D. ' + d + ' cm)') : '');
  }
  if (d) return 'D. ' + d + ' cm';
  return '';
}

// ============================================================================
// ENDPOINTS HTTP (doGet / doPost — CORS-safe text/plain;charset=utf-8)
// ============================================================================
function doGet(e) {
  try {
    const payload = parseRequestPayload_(e);
    const action = String(payload.action || 'prompts_health').trim();
    if (action === 'prompts_health' || action === 'health' || action === 'ping') {
      const forbiddenErr = validateNoForbiddenProjectAIdsInPayload_(payload, action);
      if (forbiddenErr) return jsonResponse_(forbiddenErr);
      return jsonResponse_(handlePromptsHealth_(payload));
    }
    return jsonResponse_({
      ok: false,
      project: PROMPTS_PROJECT_TAG_,
      error: 'Esta acción requiere HTTP POST.'
    });
  } catch (err) {
    return jsonResponse_({
      ok: false,
      project: PROMPTS_PROJECT_TAG_,
      error: (err && err.message) ? err.message : String(err)
    });
  }
}

function doPost(e) {
  try {
    const payload = parseRequestPayload_(e);
    const action = String(payload.action || '').trim();
    if (!action) {
      return jsonResponse_({
        ok: false,
        project: PROMPTS_PROJECT_TAG_,
        error: 'Falta el parámetro "action" en la solicitud.'
      });
    }
    return jsonResponse_(dispatchPromptsAction_(action, payload));
  } catch (err) {
    return jsonResponse_({
      ok: false,
      project: PROMPTS_PROJECT_TAG_,
      error: (err && err.message) ? err.message : String(err)
    });
  }
}

function dispatchPromptsAction_(action, payload) {
  const forbiddenErr = validateNoForbiddenProjectAIdsInPayload_(payload, action);
  if (forbiddenErr) return forbiddenErr;

  switch (action) {
    case 'prompts_health':
      return handlePromptsHealth_(payload);
    case 'prompts_propt_list':
      return handlePromptsProptList_(payload);
    case 'prompts_propt_upload':
      return handlePromptsProptUpload_(payload);
    case 'prompts_propt_delete':
      return handlePromptsProptDelete_(payload);
    case 'prompts_materials_list':
      return handlePromptsMaterialsList_(payload);
    case 'prompts_sku_lookup':
      return handlePromptsSkuLookup_(payload);
    case 'odoo_buzon_list':
      return handleOdooBuzonList_(payload);
    case 'odoo_buzon_upload':
      return handleOdooBuzonUpload_(payload);
    case 'odoo_move_to_final':
      return handleOdooMoveToFinal_(payload);
    case 'odoo_register_foto':
      return handleOdooRegisterFoto_(payload);
    case 'prompts_repair_permissions':
      return handlePromptsRepairPermissions_(payload);
    default:
      return {
        ok: false,
        project: PROMPTS_PROJECT_TAG_,
        error: 'Acción no reconocida en AppsScript_Prompts_Odoo: "' + action + '".'
      };
  }
}

// ============================================================================
// 1. prompts_health (GET / POST)
// ============================================================================
const PROMPTS_HEALTH_CACHE_KEY_ = 'PROMPTS_HEALTH_BULK_V1';
const PROMPTS_HEALTH_CACHE_TTL_SEC_ = 120;

function inspectFolderHealth_(folderId, label, options) {
  const opts = options || {};
  const info = {
    id: folderId,
    label: label,
    name: label,
    ok: false,
    trashed: false,
    count: 0,
    url: 'https://drive.google.com/drive/folders/' + folderId
  };
  try {
    const folder = getSafeFolderById_(folderId, 'prompts_health:' + label);
    info.name = String(folder.getName() || label);
    info.trashed = !!(folder.isTrashed && folder.isTrashed());
    if (info.trashed) {
      info.ok = false;
      info.warning = 'La carpeta "' + info.name + '" está en la Papelera de Google Drive.';
      return info;
    }
    info.ok = true;
    if (!opts.skipCount) {
      info.count = countImagesInFolder_(folder, { checkMultiParent: opts.checkMultiParent !== false });
    }
  } catch (err) {
    info.ok = false;
    info.error = (err && err.message) ? err.message : String(err);
  }
  return info;
}

function handlePromptsHealth_(payload) {
  const opts = payload || {};
  const fullScan = opts.fullScan === true || String(opts.fullScan || '').trim().toLowerCase() === 'true';
  const warnings = [];
  let sheetOk = false;
  let sheetName = 'Base de Datos Generales';
  let sheetError = '';

  try {
    const ss = getPromptsSpreadsheet_();
    sheetName = String(ss.getName() || sheetName);
    sheetOk = true;
  } catch (eSs) {
    sheetError = (eSs && eSs.message) ? eSs.message : String(eSs);
    warnings.push('No se pudo abrir Base de Datos Generales: ' + sheetError);
  }

  // Carpetas de bandeja activas: inspección en vivo con checkMultiParent: true
  const subirPropt = inspectFolderHealth_(SUBIR_PROPT_FOLDER_ID_, 'SUBIR PROPT', { checkMultiParent: true });
  const buzonOdoo = inspectFolderHealth_(BUZON_ODOO_FOLDER_ID_, 'SUBIDA DE FOTOS', { checkMultiParent: true });

  // Carpetas masivas de catálogo solo lectura: checkMultiParent: false + caché 120s (evita ~245+ RPCs en GAS V8)
  let fotosOdoo = null;
  let telas = null;
  let maderas = null;
  let bulkCacheHit = false;

  if (!fullScan) {
    try {
      const cache = CacheService.getScriptCache();
      const cachedRaw = cache && cache.get(PROMPTS_HEALTH_CACHE_KEY_);
      if (cachedRaw) {
        const cached = JSON.parse(cachedRaw);
        if (cached && cached.fotosOdoo && cached.telas && cached.maderas) {
          fotosOdoo = cached.fotosOdoo;
          telas = cached.telas;
          maderas = cached.maderas;
          bulkCacheHit = true;
        }
      }
    } catch (eCacheRead) {}
  }

  if (!bulkCacheHit) {
    fotosOdoo = inspectFolderHealth_(FOTOS_ODOO_FINAL_FOLDER_ID_, 'fotos odoo', { checkMultiParent: false });
    telas = inspectFolderHealth_(TELAS_FOLDER_ID_, 'TELAS', { checkMultiParent: false });
    maderas = inspectFolderHealth_(MADERAS_FOLDER_ID_, 'MADERAS', { checkMultiParent: false });
    fotosOdoo.subfolders = {};
    const subKeys = Object.keys(FOTOS_ODOO_SUBFOLDERS_);
    for (let i = 0; i < subKeys.length; i++) {
      const sk = subKeys[i];
      const meta = FOTOS_ODOO_SUBFOLDERS_[sk];
      fotosOdoo.subfolders[sk] = inspectFolderHealth_(meta.id, meta.name, { checkMultiParent: false });
    }
    try {
      const cache = CacheService.getScriptCache();
      if (cache) {
        cache.put(
          PROMPTS_HEALTH_CACHE_KEY_,
          JSON.stringify({ fotosOdoo: fotosOdoo, telas: telas, maderas: maderas }),
          PROMPTS_HEALTH_CACHE_TTL_SEC_
        );
      }
    } catch (eCacheWrite) {}
  }

  if (!subirPropt.ok) {
    warnings.push('Carpeta SUBIR PROPT no disponible: ' + (subirPropt.warning || subirPropt.error || 'error'));
  }
  if (buzonOdoo.trashed) {
    warnings.push(
      'ATENCIÓN: La carpeta SUBIDA DE FOTOS (' + BUZON_ODOO_FOLDER_ID_ +
      ') está actualmente en la Papelera de Google Drive (trashed: true). Restáurala antes de usar el Buzón de Alta de Odoo.'
    );
  } else if (!buzonOdoo.ok) {
    warnings.push('Carpeta SUBIDA DE FOTOS no disponible: ' + (buzonOdoo.error || 'error'));
  }
  if (!fotosOdoo.ok) {
    warnings.push('Carpeta fotos odoo no disponible: ' + (fotosOdoo.warning || fotosOdoo.error || 'error'));
  }

  return {
    ok: sheetOk && subirPropt.ok,
    project: PROMPTS_PROJECT_TAG_,
    sheetId: PROMPTS_SHEET_ID_,
    sheetName: sheetName,
    sheetOk: sheetOk,
    sheetError: sheetError || undefined,
    pinConfigured: Boolean(getConfiguredPromptsPin_()),
    bulkCacheHit: bulkCacheHit,
    folders: {
      subirPropt: subirPropt,
      buzonOdoo: buzonOdoo,
      fotosOdoo: fotosOdoo,
      telas: telas,
      maderas: maderas
    },
    warnings: warnings,
    isolation: {
      strictMode: true,
      exclusivePromptsInboxId: SUBIR_PROPT_FOLDER_ID_,
      forbiddenProjectAIdsCount: Object.keys(FORBIDDEN_PROJECT_A_IDS_).length
    },
    webAppUrl: resolveWebAppUrl_(),
    timestamp: new Date().toISOString()
  };
}

// ============================================================================
// 2. prompts_propt_list (exclusivo SUBIR PROPT, indexado por Drive file ID)
// ============================================================================
function handlePromptsProptList_(payload) {
  const auth = verifyPromptsOwnerAuth_(payload);
  if (!auth.ok) return auth;

  const folder = getSafeFolderById_(SUBIR_PROPT_FOLDER_ID_, 'prompts_propt_list');
  if (folder.isTrashed && folder.isTrashed()) {
    return {
      ok: false,
      folderTrashed: true,
      folderId: SUBIR_PROPT_FOLDER_ID_,
      error: 'La carpeta SUBIR PROPT está en la Papelera de Google Drive.'
    };
  }
  const files = listImagesInFolderById_(folder, { checkMultiParent: true });
  return {
    ok: true,
    project: PROMPTS_PROJECT_TAG_,
    folderId: SUBIR_PROPT_FOLDER_ID_,
    folderName: String(folder.getName() || 'SUBIR PROPT'),
    folderUrl: 'https://drive.google.com/drive/folders/' + SUBIR_PROPT_FOLDER_ID_,
    count: files.length,
    files: files,
    timestamp: new Date().toISOString()
  };
}

// ============================================================================
// 3. prompts_propt_upload (sube SOLO a SUBIR PROPT, valida image/* y tamaño)
// ============================================================================
function handlePromptsProptUpload_(payload) {
  const auth = verifyPromptsOwnerAuth_(payload);
  if (!auth.ok) return auth;

  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const parsed = parseAndValidateImageUpload_(payload, 'subir_propt');
    if (!parsed.ok) return parsed;

    const folder = getSafeFolderById_(SUBIR_PROPT_FOLDER_ID_, 'prompts_propt_upload');
    if (folder.isTrashed && folder.isTrashed()) {
      return {
        ok: false,
        folderTrashed: true,
        folderId: SUBIR_PROPT_FOLDER_ID_,
        error: 'La carpeta SUBIR PROPT está en la Papelera de Google Drive.'
      };
    }

    const created = folder.createFile(parsed.blob);
    try {
      created.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (eShare) {}

    return {
      ok: true,
      project: PROMPTS_PROJECT_TAG_,
      folderId: SUBIR_PROPT_FOLDER_ID_,
      file: formatDriveFileMeta_(created, SUBIR_PROPT_FOLDER_ID_),
      timestamp: new Date().toISOString()
    };
  } finally {
    try { lock.releaseLock(); } catch (eRel) {}
  }
}

// ============================================================================
// 4. prompts_propt_delete (borra por fileId, valida pertenencia y deny-list)
// ============================================================================
function handlePromptsProptDelete_(payload) {
  const auth = verifyPromptsOwnerAuth_(payload);
  if (!auth.ok) return auth;

  const fileId = String((payload && (payload.fileId || payload.driveFileId)) || '').trim();
  if (!fileId) {
    return { ok: false, error: 'Se requiere "fileId" (ID de archivo Drive) para eliminar. No se elimina solo por nombre.' };
  }
  assertNotForbiddenProjectAId_(fileId, 'prompts_propt_delete');

  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const file = DriveApp.getFileById(fileId);
    if (!file) {
      return { ok: false, error: 'Archivo no encontrado en Drive: ' + fileId };
    }

    const allowedParents = [SUBIR_PROPT_FOLDER_ID_];
    try {
      const buzon = getSafeFolderById_(BUZON_ODOO_FOLDER_ID_, 'prompts_propt_delete:checkBuzon');
      if (buzon && !(buzon.isTrashed && buzon.isTrashed())) {
        allowedParents.push(BUZON_ODOO_FOLDER_ID_);
      }
    } catch (eBuz) {}

    const matchedFolderId = assertFileBelongsToAllowedFolders_(file, allowedParents, 'prompts_propt_delete');
    const deletedName = String(file.getName() || '');
    file.setTrashed(true);

    return {
      ok: true,
      project: PROMPTS_PROJECT_TAG_,
      deletedFileId: fileId,
      deletedFileName: deletedName,
      folderId: matchedFolderId,
      trashed: true,
      timestamp: new Date().toISOString()
    };
  } finally {
    try { lock.releaseLock(); } catch (eRel) {}
  }
}

// ============================================================================
// 5. prompts_materials_list (solo lectura: TELAS + MADERAS)
// ============================================================================
function handlePromptsMaterialsList_(payload) {
  const auth = verifyPromptsOwnerAuth_(payload);
  if (!auth.ok) return auth;

  const telasFolder = getSafeFolderById_(TELAS_FOLDER_ID_, 'prompts_materials_list:TELAS');
  const maderasFolder = getSafeFolderById_(MADERAS_FOLDER_ID_, 'prompts_materials_list:MADERAS');

  const telas = (telasFolder.isTrashed && telasFolder.isTrashed()) ? [] : listImagesInFolderById_(telasFolder, { checkMultiParent: false });
  const maderas = (maderasFolder.isTrashed && maderasFolder.isTrashed()) ? [] : listImagesInFolderById_(maderasFolder, { checkMultiParent: false });

  return {
    ok: true,
    project: PROMPTS_PROJECT_TAG_,
    readOnly: true,
    telasFolderId: TELAS_FOLDER_ID_,
    maderasFolderId: MADERAS_FOLDER_ID_,
    telas: telas,
    maderas: maderas,
    counts: {
      telas: telas.length,
      maderas: maderas.length
    },
    timestamp: new Date().toISOString()
  };
}

// ============================================================================
// 6. prompts_sku_lookup (solo lectura en DATOS GENERAL!A4:AJ)
// ============================================================================
function handlePromptsSkuLookup_(payload) {
  const auth = verifyPromptsOwnerAuth_(payload);
  if (!auth.ok) return auth;

  const rawQuery = String((payload && (payload.sku || payload.query)) || '').trim();
  const queryUpper = rawQuery.toUpperCase();
  const queryNorm = normalizeSkuForMatch_(rawQuery);
  if (queryNorm.length < 3) {
    return { ok: false, error: 'Ingresa al menos 3 caracteres de SKU para buscar en Base de Datos Generales.' };
  }

  const ss = getPromptsSpreadsheet_();
  const sh = ss.getSheetByName('DATOS GENERAL');
  if (!sh) {
    return { ok: false, error: 'No se encontró la pestaña "DATOS GENERAL" en Base de Datos Generales.' };
  }

  const lastRow = sh.getLastRow();
  if (lastRow < DATOS_GENERAL_MIN_DATA_ROW_) {
    return { ok: true, found: false, query: rawQuery, match: null };
  }

  const numRows = lastRow - DATOS_GENERAL_MIN_DATA_ROW_ + 1;
  // Leer A4:AJ (36 columnas) en modo solo lectura
  const rows = sh.getRange(DATOS_GENERAL_MIN_DATA_ROW_, 1, numRows, 36).getDisplayValues();

  let exactIdx = -1;
  let normIdx = -1;
  let prefixIdx = -1;

  for (let i = 0; i < rows.length; i++) {
    const cellSku = String(rows[i][0] || '').trim();
    if (!cellSku) continue;
    const cellUpper = cellSku.toUpperCase();
    if (cellUpper === queryUpper) {
      exactIdx = i;
      break;
    }
    const cellNorm = normalizeSkuForMatch_(cellSku);
    if (normIdx === -1 && cellNorm === queryNorm) {
      normIdx = i;
    }
    if (prefixIdx === -1 && queryNorm.length >= 4 && cellNorm.indexOf(queryNorm) === 0) {
      prefixIdx = i;
    }
  }

  const bestIdx = exactIdx !== -1 ? exactIdx : (normIdx !== -1 ? normIdx : prefixIdx);
  if (bestIdx === -1) {
    return {
      ok: true,
      project: PROMPTS_PROJECT_TAG_,
      found: false,
      query: rawQuery,
      match: null
    };
  }

  const row = rows[bestIdx];
  const fila = DATOS_GENERAL_MIN_DATA_ROW_ + bestIdx;
  const matchType = exactIdx !== -1 ? 'exact' : (normIdx !== -1 ? 'normalized' : 'prefix');
  const nombre = String(row[25] || '').trim() || String(row[1] || '').trim() || String(row[23] || '').trim();
  const tipoMueble = String(row[24] || '').trim() || String(row[15] || '').trim();
  const medidas = formatMedidasFromDatosGeneral_(row[2], row[3], row[4], row[5], row[6]);

  return {
    ok: true,
    project: PROMPTS_PROJECT_TAG_,
    found: true,
    matchType: matchType,
    query: rawQuery,
    match: {
      fila: fila,
      sku: String(row[0] || '').trim(),
      nombre: nombre,
      tipo_mueble: tipoMueble,
      categoria: String(row[15] || '').trim(),
      modelo: String(row[23] || '').trim(),
      medidas: medidas,
      foto_mueble_nom: String(row[26] || '').trim(),
      foto_tela_nom: String(row[29] || '').trim(),
      foto_madera_nom: String(row[32] || '').trim(),
      foto_swatch_nom: String(row[35] || '').trim()
    }
  };
}

// ============================================================================
// 7. odoo_buzon_list / odoo_buzon_upload / odoo_move_to_final
//    (Con detección explícita de carpeta SUBIDA DE FOTOS en Papelera)
// ============================================================================
function getActiveBuzonOdooFolder_(contextLabel) {
  const folder = getSafeFolderById_(BUZON_ODOO_FOLDER_ID_, contextLabel);
  if (folder.isTrashed && folder.isTrashed()) {
    return {
      ok: false,
      folderTrashed: true,
      folderId: BUZON_ODOO_FOLDER_ID_,
      folderName: String(folder.getName() || 'SUBIDA DE FOTOS'),
      error: 'La carpeta SUBIDA DE FOTOS (' + BUZON_ODOO_FOLDER_ID_ + ') está en la Papelera de Google Drive. Restáurala antes de continuar.'
    };
  }
  return { ok: true, folder: folder };
}

function handleOdooBuzonList_(payload) {
  const auth = verifyPromptsOwnerAuth_(payload);
  if (!auth.ok) return auth;

  const buzonCheck = getActiveBuzonOdooFolder_('odoo_buzon_list');
  if (!buzonCheck.ok) return buzonCheck;

  const files = listImagesInFolderById_(buzonCheck.folder);
  return {
    ok: true,
    project: PROMPTS_PROJECT_TAG_,
    folderId: BUZON_ODOO_FOLDER_ID_,
    folderName: String(buzonCheck.folder.getName() || 'SUBIDA DE FOTOS'),
    count: files.length,
    files: files,
    timestamp: new Date().toISOString()
  };
}

function handleOdooBuzonUpload_(payload) {
  const auth = verifyPromptsOwnerAuth_(payload);
  if (!auth.ok) return auth;

  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const buzonCheck = getActiveBuzonOdooFolder_('odoo_buzon_upload');
    if (!buzonCheck.ok) return buzonCheck;

    const parsed = parseAndValidateImageUpload_(payload, 'odoo-buzon');
    if (!parsed.ok) return parsed;

    const created = buzonCheck.folder.createFile(parsed.blob);
    try {
      created.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (eShare) {}

    return {
      ok: true,
      project: PROMPTS_PROJECT_TAG_,
      folderId: BUZON_ODOO_FOLDER_ID_,
      file: formatDriveFileMeta_(created, BUZON_ODOO_FOLDER_ID_),
      timestamp: new Date().toISOString()
    };
  } finally {
    try { lock.releaseLock(); } catch (eRel) {}
  }
}

function resolveOdooFinalDestFolder_(subfolderKey) {
  const raw = String(subfolderKey || '').trim();
  if (raw && isForbiddenProjectAId_(raw)) {
    return {
      ok: false,
      forbiddenFolder: true,
      error: 'Aislamiento Proyecto A/B: carpeta destino prohibida "' + FORBIDDEN_PROJECT_A_IDS_[raw] + '".'
    };
  }
  const keyNorm = raw.toUpperCase();
  if (!raw || keyNorm === 'ROOT' || raw === FOTOS_ODOO_FINAL_FOLDER_ID_) {
    const rootFolder = getSafeFolderById_(FOTOS_ODOO_FINAL_FOLDER_ID_, 'odoo_move_to_final:root');
    if (rootFolder.isTrashed && rootFolder.isTrashed()) {
      return { ok: false, folderTrashed: true, folderId: FOTOS_ODOO_FINAL_FOLDER_ID_, error: 'La carpeta fotos odoo está en la Papelera.' };
    }
    return { ok: true, folder: rootFolder, id: FOTOS_ODOO_FINAL_FOLDER_ID_, name: String(rootFolder.getName() || 'fotos odoo'), key: 'ROOT' };
  }

  let matchedMeta = null;
  if (Object.prototype.hasOwnProperty.call(FOTOS_ODOO_SUBFOLDERS_, keyNorm)) {
    matchedMeta = FOTOS_ODOO_SUBFOLDERS_[keyNorm];
  } else {
    const subKeys = Object.keys(FOTOS_ODOO_SUBFOLDERS_);
    for (let i = 0; i < subKeys.length; i++) {
      const meta = FOTOS_ODOO_SUBFOLDERS_[subKeys[i]];
      if (meta && meta.id === raw) {
        matchedMeta = meta;
        break;
      }
    }
  }

  if (!matchedMeta) {
    return {
      ok: false,
      error: 'Subcarpeta destino inválida en fotos odoo ("' + raw + '"). Valores permitidos: ROOT, MUEBLES, ACCESORIOS, TELAS, OTROS.'
    };
  }

  const subFolder = getSafeFolderById_(matchedMeta.id, 'odoo_move_to_final:' + matchedMeta.key);
  if (subFolder.isTrashed && subFolder.isTrashed()) {
    return { ok: false, folderTrashed: true, folderId: matchedMeta.id, error: 'La subcarpeta destino "' + matchedMeta.name + '" está en la Papelera.' };
  }
  return { ok: true, folder: subFolder, id: matchedMeta.id, name: String(subFolder.getName() || matchedMeta.name), key: matchedMeta.key };
}

function handleOdooMoveToFinal_(payload) {
  const auth = verifyPromptsOwnerAuth_(payload);
  if (!auth.ok) return auth;

  const fileId = String((payload && (payload.fileId || payload.driveFileId)) || '').trim();
  if (!fileId) {
    return { ok: false, error: 'Se requiere "fileId" para mover una foto a fotos odoo.' };
  }
  assertNotForbiddenProjectAId_(fileId, 'odoo_move_to_final');

  const subKeyRaw = String((payload && payload.subfolderKey) || '').trim();
  const targetSubRaw = String((payload && payload.targetSubfolder) || '').trim();
  if (subKeyRaw && targetSubRaw && subKeyRaw.toUpperCase() !== targetSubRaw.toUpperCase()) {
    return { ok: false, error: 'Conflicto de parámetros: "subfolderKey" y "targetSubfolder" tienen valores distintos.' };
  }
  const requestedSubfolder = subKeyRaw || targetSubRaw;

  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const dest = resolveOdooFinalDestFolder_(requestedSubfolder);
    if (!dest.ok) return dest;

    const file = DriveApp.getFileById(fileId);
    if (!file) {
      return { ok: false, error: 'Archivo no encontrado en Drive: ' + fileId };
    }
    if (file.isTrashed && file.isTrashed()) {
      return { ok: false, fileTrashed: true, error: 'El archivo origen está en la Papelera de Google Drive y no puede moverse a fotos odoo.' };
    }
    if (isFileInForbiddenProjectAFolder_(file)) {
      return {
        ok: false,
        forbiddenFolder: true,
        error: 'Aislamiento Proyecto A/B: el archivo pertenece a una carpeta exclusiva de Proyecto A y no puede moverse desde Prompts/Odoo.'
      };
    }

    const allowFromPropt = !!(payload && payload.allowFromPropt);
    const buzonCheck = getActiveBuzonOdooFolder_('odoo_move_to_final');
    const fileParents = getFileParentIds_(file);
    const inSubirPropt = fileParents.indexOf(SUBIR_PROPT_FOLDER_ID_) !== -1;
    const inBuzonOdoo = fileParents.indexOf(BUZON_ODOO_FOLDER_ID_) !== -1;

    if (!allowFromPropt) {
      if (!buzonCheck.ok) return buzonCheck;
    } else if (!inSubirPropt) {
      if (inBuzonOdoo && !buzonCheck.ok) return buzonCheck;
    } else {
      const proptFolder = getSafeFolderById_(SUBIR_PROPT_FOLDER_ID_, 'odoo_move_to_final:checkPropt');
      if (proptFolder.isTrashed && proptFolder.isTrashed()) {
        return { ok: false, folderTrashed: true, folderId: SUBIR_PROPT_FOLDER_ID_, error: 'La carpeta SUBIR PROPT está en la Papelera de Google Drive.' };
      }
    }

    const allowedSources = [];
    if (buzonCheck.ok) allowedSources.push(BUZON_ODOO_FOLDER_ID_);
    if (allowFromPropt) allowedSources.push(SUBIR_PROPT_FOLDER_ID_);
    assertFileBelongsToAllowedFolders_(file, allowedSources, 'odoo_move_to_final');

    const rawNewName = String((payload && payload.newName) || '').trim();
    if (rawNewName) {
      const safeNewName = rawNewName
        .replace(/(?:^|[\\/])\.\.(?=[\\/]|$)/g, ' ')
        .replace(/\.\.+/g, '.')
        .replace(/[\\/:*?"<>|]+/g, ' ')
        .replace(/[\u0000-\u001f]+/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/^[.\s]+|[.\s]+$/g, '')
        .trim();
      if (safeNewName) {
        file.setName(safeNewName);
      }
    }
    file.moveTo(dest.folder);
    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (eShare) {}

    return {
      ok: true,
      project: PROMPTS_PROJECT_TAG_,
      destFolderKey: dest.key,
      destFolderId: dest.id,
      destFolderName: dest.name,
      file: formatDriveFileMeta_(file, dest.id),
      timestamp: new Date().toISOString()
    };
  } finally {
    try { lock.releaseLock(); } catch (eRel) {}
  }
}

// ============================================================================
// 8. odoo_register_foto (Validación atómica, Fila >= 4, columnas y anti-fórmulas)
// ============================================================================
const MAX_SHEET_ROW_EXTENSION_ = 5000;

function parseStrictSheetRow_(rawVal, maxExistingRows, fieldLabel, minRow) {
  const minAllowed = minRow || 4;
  if (rawVal === undefined || rawVal === null || String(rawVal).trim() === '') {
    return { ok: true, provided: false, row: 0 };
  }
  if (typeof rawVal === 'boolean' || typeof rawVal === 'object') {
    return {
      ok: false,
      error: 'Número de fila inválido en "' + fieldLabel + '": se requiere un entero >= ' + minAllowed + '.'
    };
  }
  const n = Number(rawVal);
  if (!isFinite(n) || !Number.isInteger(n)) {
    return {
      ok: false,
      error: 'Número de fila inválido en "' + fieldLabel + '" ("' + String(rawVal) + '"): se requiere un entero finito >= ' + minAllowed + '.'
    };
  }
  if (n < minAllowed) {
    return {
      ok: false,
      formulaProtected: true,
      error: 'Protección de fórmulas: prohibido escribir en filas < ' + minAllowed + ' de ' + fieldLabel + ' (fila 3 contiene fórmulas maestras).'
    };
  }
  const maxAllowed = Math.max(Number(maxExistingRows) || 0, minAllowed) + MAX_SHEET_ROW_EXTENSION_;
  if (n > maxAllowed) {
    return {
      ok: false,
      error: 'Número de fila fuera de rango en "' + fieldLabel + '" (' + n + ' excede el máximo permitido ' + maxAllowed + ').'
    };
  }
  return { ok: true, provided: true, row: n };
}

function validateSafeHttpsLink_(val, fieldLabel) {
  const s = String(val === null || val === undefined ? '' : val).trim();
  if (!s || /^\s*[=+@\t\r]/.test(s) || !/^https:\/\/\S+$/i.test(s)) {
    return {
      ok: false,
      invalidLink: true,
      formulaInjectionBlocked: true,
      error: 'Enlace inválido o bloqueado en "' + fieldLabel + '": se requiere una URL https:// válida sin fórmulas.'
    };
  }
  return { ok: true, value: s };
}

function validateSafeSheetText_(val, fieldLabel) {
  if (val === null || val === undefined || val === '') {
    return { ok: true, value: '' };
  }
  if (typeof val === 'number') {
    if (!isFinite(val)) {
      return { ok: false, error: 'Valor numérico inválido en "' + fieldLabel + '".' };
    }
    return { ok: true, value: val };
  }
  const s = String(val);
  if (/^\s*[=+@\t\r]/.test(s)) {
    return {
      ok: false,
      formulaInjectionBlocked: true,
      error: 'Inyección de fórmula bloqueada en "' + fieldLabel + '": el valor no puede iniciar con =, +, @ o caracteres de control.'
    };
  }
  if (/^\s*-/.test(s)) {
    const trimmed = s.trim();
    if (!/^-\d+(?:\.\d+)?$/.test(trimmed) || !isFinite(Number(trimmed))) {
      return {
        ok: false,
        formulaInjectionBlocked: true,
        error: 'Inyección de fórmula bloqueada en "' + fieldLabel + '": el valor con "-" inicial debe ser un número finito válido.'
      };
    }
  }
  return { ok: true, value: val };
}

function handleOdooRegisterFoto_(payload) {
  const auth = verifyPromptsOwnerAuth_(payload);
  if (!auth.ok) return auth;

  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const ss = getPromptsSpreadsheet_();
    const result = {
      ok: true,
      project: PROMPTS_PROJECT_TAG_,
      fotosNormalizadas: null,
      datosGeneral: null
    };

    // ========================================================================
    // FASE 1: VALIDACIÓN Y PLANIFICACIÓN COMPLETA (CERO MUTACIONES EN SHEETS)
    // ========================================================================
    const tipoRaw = String((payload && payload.tipo) || '').trim().toUpperCase();
    const nombreFoto = String((payload && (payload.nombre || payload.fileName)) || '').trim();
    const linkFoto = String((payload && (payload.link || payload.viewUrl || payload.url)) || '').trim();
    const hasNormRowArg = !!(payload && payload.rowNumber !== undefined && payload.rowNumber !== null && String(payload.rowNumber).trim() !== '');

    let normPlan = null;
    if (tipoRaw || hasNormRowArg) {
      if (!tipoRaw) {
        return { ok: false, error: 'Se especificó "rowNumber" pero falta "tipo" (MUEBLE, TELA, MADERA, SWATCH).' };
      }
      if (!Object.prototype.hasOwnProperty.call(FOTOS_NORM_BLOCKS_, tipoRaw)) {
        return {
          ok: false,
          error: 'Tipo de foto inválido ("' + tipoRaw + '"). Valores válidos: MUEBLE, TELA, MADERA, SWATCH.'
        };
      }
      const block = FOTOS_NORM_BLOCKS_[tipoRaw];
      if (!nombreFoto || !linkFoto) {
        return { ok: false, error: 'Se requieren "nombre" y "link" para registrar en FOTOS NORMALIZADAS.' };
      }

      const nameCheck = validateSafeSheetText_(nombreFoto, 'FOTOS NORMALIZADAS.nombre');
      if (!nameCheck.ok) return nameCheck;
      const linkCheck = validateSafeHttpsLink_(linkFoto, 'FOTOS NORMALIZADAS.link');
      if (!linkCheck.ok) return linkCheck;

      const shNorm = ss.getSheetByName('FOTOS NORMALIZADAS');
      if (!shNorm) {
        return { ok: false, error: 'No se encontró la pestaña "FOTOS NORMALIZADAS" en Base de Datos Generales.' };
      }

      const normRowCheck = parseStrictSheetRow_(
        payload && payload.rowNumber,
        shNorm.getMaxRows(),
        'FOTOS NORMALIZADAS',
        FOTOS_NORM_MIN_DATA_ROW_
      );
      if (!normRowCheck.ok) return normRowCheck;

      let targetNormRow = normRowCheck.row;
      if (!normRowCheck.provided) {
        const lastRow = Math.max(shNorm.getLastRow(), FOTOS_NORM_MIN_DATA_ROW_);
        const scanCount = Math.max(1, lastRow - FOTOS_NORM_MIN_DATA_ROW_ + 1);
        const nameVals = shNorm.getRange(FOTOS_NORM_MIN_DATA_ROW_, block.nameCol, scanCount, 1).getDisplayValues();
        const linkVals = shNorm.getRange(FOTOS_NORM_MIN_DATA_ROW_, block.linkCol, scanCount, 1).getDisplayValues();
        let lastUsedRow = FOTOS_NORM_MIN_DATA_ROW_ - 1;
        for (let i = 0; i < scanCount; i++) {
          const nV = String(nameVals[i][0] || '').trim();
          const lV = String(linkVals[i][0] || '').trim();
          if (nV || lV) {
            lastUsedRow = FOTOS_NORM_MIN_DATA_ROW_ + i;
            if (nV.toUpperCase() === nombreFoto.toUpperCase() && lV === linkFoto) {
              targetNormRow = FOTOS_NORM_MIN_DATA_ROW_ + i;
              break;
            }
          }
        }
        if (!targetNormRow) {
          targetNormRow = Math.max(FOTOS_NORM_MIN_DATA_ROW_, lastUsedRow + 1);
        }
      }

      normPlan = {
        sheet: shNorm,
        block: block,
        row: targetNormRow,
        nombre: nombreFoto,
        link: linkCheck.value
      };
    }

    // Validación Sección B: DATOS GENERAL (acepta datosGeneralRow/fila y datosGeneralFields/datosGeneralUpdates)
    const hasDgRowArg = !!(payload && payload.datosGeneralRow !== undefined && payload.datosGeneralRow !== null && String(payload.datosGeneralRow).trim() !== '');
    const hasFilaArg = !!(payload && payload.fila !== undefined && payload.fila !== null && String(payload.fila).trim() !== '');
    const dgFieldsObj = (payload && payload.datosGeneralFields && typeof payload.datosGeneralFields === 'object' && !Array.isArray(payload.datosGeneralFields))
      ? payload.datosGeneralFields
      : null;
    const dgUpdatesObj = (payload && payload.datosGeneralUpdates && typeof payload.datosGeneralUpdates === 'object' && !Array.isArray(payload.datosGeneralUpdates))
      ? payload.datosGeneralUpdates
      : null;
    const skuForDg = String((payload && payload.sku) || '').trim().toUpperCase();

    let dgPlan = null;
    if (hasDgRowArg || hasFilaArg || dgFieldsObj || dgUpdatesObj || (skuForDg && tipoRaw && payload && payload.updateDatosGeneral)) {
      const shDg = ss.getSheetByName('DATOS GENERAL');
      if (!shDg) {
        return { ok: false, error: 'No se encontró la pestaña "DATOS GENERAL" en Base de Datos Generales.' };
      }

      const maxDgRows = shDg.getMaxRows();
      const parsedDgRow = parseStrictSheetRow_(
        payload && payload.datosGeneralRow,
        maxDgRows,
        'DATOS GENERAL',
        DATOS_GENERAL_MIN_DATA_ROW_
      );
      if (!parsedDgRow.ok) return parsedDgRow;

      const parsedFila = parseStrictSheetRow_(
        payload && payload.fila,
        maxDgRows,
        'DATOS GENERAL (fila)',
        DATOS_GENERAL_MIN_DATA_ROW_
      );
      if (!parsedFila.ok) return parsedFila;

      if (parsedDgRow.provided && parsedFila.provided && parsedDgRow.row !== parsedFila.row) {
        return {
          ok: false,
          error: 'Conflicto de parámetros: "datosGeneralRow" (' + parsedDgRow.row + ') y "fila" (' + parsedFila.row + ') tienen valores distintos.'
        };
      }

      let targetDgRow = parsedDgRow.provided ? parsedDgRow.row : (parsedFila.provided ? parsedFila.row : 0);
      if (!targetDgRow && skuForDg) {
        const lastDgRow = shDg.getLastRow();
        if (lastDgRow >= DATOS_GENERAL_MIN_DATA_ROW_) {
          const skuVals = shDg.getRange(DATOS_GENERAL_MIN_DATA_ROW_, 1, lastDgRow - DATOS_GENERAL_MIN_DATA_ROW_ + 1, 1).getDisplayValues();
          for (let r = 0; r < skuVals.length; r++) {
            if (String(skuVals[r][0] || '').trim().toUpperCase() === skuForDg) {
              targetDgRow = DATOS_GENERAL_MIN_DATA_ROW_ + r;
              break;
            }
          }
        }
      }

      if (!targetDgRow || targetDgRow < DATOS_GENERAL_MIN_DATA_ROW_) {
        return {
          ok: false,
          error: 'No se encontró una fila válida (>= 4) en DATOS GENERAL para actualizar.'
        };
      }

      const toWriteByCol = {};
      const blockedColumns = [];

      if (normPlan && payload && payload.updateDatosGeneral !== false) {
        toWriteByCol[normPlan.block.datosNomCol] = normPlan.nombre;
        toWriteByCol[normPlan.block.datosLinkCol] = normPlan.link;
      }

      const fieldSources = [];
      if (dgFieldsObj) fieldSources.push(dgFieldsObj);
      if (dgUpdatesObj) fieldSources.push(dgUpdatesObj);

      for (let sIdx = 0; sIdx < fieldSources.length; sIdx++) {
        const srcObj = fieldSources[sIdx];
        const fKeys = Object.keys(srcObj);
        for (let k = 0; k < fKeys.length; k++) {
          const rawKey = fKeys[k];
          const lowerKey = String(rawKey || '').trim().toLowerCase();
          const colIdx = Object.prototype.hasOwnProperty.call(DATOS_GENERAL_FIELD_TO_COL_, lowerKey)
            ? DATOS_GENERAL_FIELD_TO_COL_[lowerKey]
            : colLetterToIndex_(rawKey);
          if (!colIdx || !Object.prototype.hasOwnProperty.call(DATOS_GENERAL_MANUAL_COLS_, colIdx)) {
            blockedColumns.push(String(rawKey));
            continue;
          }
          const rawVal = srcObj[rawKey];
          if (Object.prototype.hasOwnProperty.call(DATOS_GENERAL_LINK_COLS_, colIdx)) {
            const linkCheckDg = validateSafeHttpsLink_(rawVal, 'DATOS GENERAL.' + rawKey);
            if (!linkCheckDg.ok) return linkCheckDg;
            toWriteByCol[colIdx] = linkCheckDg.value;
          } else {
            const txtCheckDg = validateSafeSheetText_(rawVal, 'DATOS GENERAL.' + rawKey);
            if (!txtCheckDg.ok) return txtCheckDg;
            toWriteByCol[colIdx] = txtCheckDg.value;
          }
        }
      }

      const colIndices = Object.keys(toWriteByCol);
      if (colIndices.length === 0 && blockedColumns.length > 0) {
        return {
          ok: false,
          formulaProtected: true,
          blockedColumns: blockedColumns,
          error: 'Todas las columnas solicitadas en DATOS GENERAL son columnas protegidas con fórmulas: ' + blockedColumns.join(', ')
        };
      }

      dgPlan = {
        sheet: shDg,
        row: targetDgRow,
        toWriteByCol: toWriteByCol,
        colIndices: colIndices,
        blockedColumns: blockedColumns
      };
    }

    if (!normPlan && !dgPlan) {
      return { ok: false, error: 'No se especificaron datos para registrar en FOTOS NORMALIZADAS ni en DATOS GENERAL.' };
    }

    // ========================================================================
    // FASE 2: EJECUCIÓN ATÓMICA (SOLO SI TODAS LAS VALIDACIONES PASARON)
    // ========================================================================
    if (normPlan) {
      if (normPlan.row > normPlan.sheet.getMaxRows()) {
        normPlan.sheet.insertRowsAfter(normPlan.sheet.getMaxRows(), normPlan.row - normPlan.sheet.getMaxRows());
      }
      // Escribir ÚNICAMENTE nameCol y linkCol (NUNCA formulaCol C/G/K/O)
      normPlan.sheet.getRange(normPlan.row, normPlan.block.nameCol).setValue(normPlan.nombre);
      normPlan.sheet.getRange(normPlan.row, normPlan.block.linkCol).setValue(normPlan.link);

      result.fotosNormalizadas = {
        tipo: normPlan.block.tipo,
        row: normPlan.row,
        nameCol: colIndexToLetter_(normPlan.block.nameCol),
        linkCol: colIndexToLetter_(normPlan.block.linkCol),
        protectedFormulaCol: colIndexToLetter_(normPlan.block.formulaCol)
      };
    }

    if (dgPlan) {
      if (dgPlan.row > dgPlan.sheet.getMaxRows()) {
        dgPlan.sheet.insertRowsAfter(dgPlan.sheet.getMaxRows(), dgPlan.row - dgPlan.sheet.getMaxRows());
      }
      const writtenColumns = [];
      for (let c = 0; c < dgPlan.colIndices.length; c++) {
        const colNum = Number(dgPlan.colIndices[c]);
        if (!Object.prototype.hasOwnProperty.call(DATOS_GENERAL_MANUAL_COLS_, colNum)) continue;
        dgPlan.sheet.getRange(dgPlan.row, colNum).setValue(dgPlan.toWriteByCol[colNum]);
        writtenColumns.push(DATOS_GENERAL_MANUAL_COLS_[colNum]);
      }

      result.datosGeneral = {
        row: dgPlan.row,
        writtenColumns: writtenColumns,
        blockedColumns: dgPlan.blockedColumns
      };
    }

    SpreadsheetApp.flush();
    result.timestamp = new Date().toISOString();
    return result;
  } finally {
    try { lock.releaseLock(); } catch (eRel) {}
  }
}

// ============================================================================
// 9. prompts_repair_permissions (SOLO carpetas de Proyecto B, jamás Proyecto A)
// ============================================================================
function handlePromptsRepairPermissions_(payload) {
  const auth = verifyPromptsOwnerAuth_(payload);
  if (!auth.ok) return auth;

  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const folderIds = [
      SUBIR_PROPT_FOLDER_ID_,
      BUZON_ODOO_FOLDER_ID_,
      FOTOS_ODOO_FINAL_FOLDER_ID_,
      FOTOS_ODOO_SUBFOLDERS_.MUEBLES.id,
      FOTOS_ODOO_SUBFOLDERS_.ACCESORIOS.id,
      FOTOS_ODOO_SUBFOLDERS_.TELAS.id,
      FOTOS_ODOO_SUBFOLDERS_.OTROS.id
    ];

    let updatedFiles = 0;
    const foldersProcessed = [];
    const skippedTrashed = [];

    for (let i = 0; i < folderIds.length; i++) {
      const fid = folderIds[i];
      assertNotForbiddenProjectAId_(fid, 'prompts_repair_permissions');
      try {
        const folder = getSafeFolderById_(fid, 'prompts_repair_permissions');
        if (folder.isTrashed && folder.isTrashed()) {
          skippedTrashed.push({ id: fid, name: String(folder.getName() || fid) });
          continue;
        }
        try {
          folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        } catch (eShF) {}

        let countInFolder = 0;
        const it = folder.getFiles();
        while (it && it.hasNext()) {
          const f = it.next();
          try {
            if (f.isTrashed && f.isTrashed()) continue;
            if (isFileInForbiddenProjectAFolder_(f)) continue;
            f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
            updatedFiles++;
            countInFolder++;
          } catch (eShFile) {}
        }
        foldersProcessed.push({
          id: fid,
          name: String(folder.getName() || fid),
          filesUpdated: countInFolder
        });
      } catch (eFol) {}
    }

    return {
      ok: true,
      project: PROMPTS_PROJECT_TAG_,
      updatedFiles: updatedFiles,
      foldersProcessed: foldersProcessed,
      skippedTrashed: skippedTrashed,
      timestamp: new Date().toISOString()
    };
  } finally {
    try { lock.releaseLock(); } catch (eRel) {}
  }
}

// ============================================================================
// 10. MENÚ EN "Base de Datos Generales" + PUBLICACIÓN URL EN _PROMPTS_CONFIG
// ============================================================================
function onOpen() {
  try {
    const ui = SpreadsheetApp.getUi();
    ui.createMenu('CREATA Prompts & Odoo')
      .addItem('🩺 Diagnóstico de carpetas (SUBIR PROPT / Odoo)', 'menuPromptsHealthCheck')
      .addItem('🔗 Guardar/Publicar URL del Web App en _PROMPTS_CONFIG', 'menuPublishPromptsWebAppUrl')
      .addItem('🔐 Configurar PIN (PROMPTS_PIN)', 'menuConfigurePromptsPin')
      .addItem('🔓 Reparar permisos públicos (solo Proyecto B)', 'menuRepairPromptsPermissions')
      .addToUi();
  } catch (eUi) {}
}

function savePromptsWebAppUrlToConfig_(webAppUrl) {
  const cleanUrl = String(webAppUrl || resolveWebAppUrl_() || '').trim();
  if (!cleanUrl || !/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/i.test(cleanUrl)) {
    return { ok: false, error: 'URL de Web App inválida. Debe coincidir exactamente con https://script.google.com/macros/s/<ID>/exec' };
  }

  try {
    const props = PropertiesService.getScriptProperties();
    if (props) props.setProperty('PROMPTS_WEBAPP_URL', cleanUrl);
  } catch (eP) {}

  const ss = getPromptsSpreadsheet_();
  let cfgSheet = ss.getSheetByName(PROMPTS_CONFIG_TAB_);
  if (!cfgSheet) {
    cfgSheet = ss.insertSheet(PROMPTS_CONFIG_TAB_);
  }
  try {
    if (cfgSheet.hideSheet) cfgSheet.hideSheet();
  } catch (eHide) {}

  cfgSheet.getRange(1, 1, 5, 2).setValues([
    ['KEY', 'VALUE'],
    ['WEBAPP_URL', cleanUrl],
    ['SUBIR_PROPT_FOLDER_ID', SUBIR_PROPT_FOLDER_ID_],
    ['PROMPTS_SHEET_ID', PROMPTS_SHEET_ID_],
    ['UPDATED_AT', new Date().toISOString()]
  ]);
  SpreadsheetApp.flush();

  return {
    ok: true,
    tabName: PROMPTS_CONFIG_TAB_,
    webAppUrl: cleanUrl
  };
}

function menuPromptsHealthCheck() {
  const res = handlePromptsHealth_({ fullScan: true });
  const ui = SpreadsheetApp.getUi();
  const lines = [
    'Proyecto: Prompts IA & Alta de Odoo (Base de Datos Generales)',
    'PIN externo (PROMPTS_PIN): ' + (res.pinConfigured ? 'Configurado ✅' : 'PENDIENTE ⚠️ (ejecuta Configurar PIN)'),
    'SUBIR PROPT: ' + (res.folders.subirPropt.ok ? ('OK (' + res.folders.subirPropt.count + ' fotos)') : 'ERROR'),
    'SUBIDA DE FOTOS (Buzón): ' + (res.folders.buzonOdoo.trashed ? 'EN PAPELERA (restaurar antes de usar)' : (res.folders.buzonOdoo.ok ? ('OK (' + res.folders.buzonOdoo.count + ' fotos)') : 'ERROR')),
    'fotos odoo: ' + (res.folders.fotosOdoo.ok ? 'OK' : 'ERROR'),
    'TELAS (RO): ' + res.folders.telas.count + ' · MADERAS (RO): ' + res.folders.maderas.count,
    'Aislamiento Proyecto A: ' + res.isolation.forbiddenProjectAIdsCount + ' IDs bloqueados.'
  ];
  if (res.warnings && res.warnings.length) {
    lines.push('', 'Avisos:', '- ' + res.warnings.join('\n- '));
  }
  ui.alert('CREATA Prompts & Odoo — Diagnóstico', lines.join('\n'), ui.ButtonSet.OK);
}

function menuPublishPromptsWebAppUrl() {
  const ui = SpreadsheetApp.getUi();
  const detected = resolveWebAppUrl_();
  const promptRes = ui.prompt(
    'Publicar URL del Web App (Proyecto B)',
    'Pega la URL /exec del despliegue de AppsScript_Prompts_Odoo.gs' + (detected ? (' (detectada: ' + detected + ')') : '') + ':',
    ui.ButtonSet.OK_CANCEL
  );
  if (promptRes.getSelectedButton() !== ui.Button.OK) return;
  const chosen = String(promptRes.getResponseText() || detected || '').trim();
  const saved = savePromptsWebAppUrlToConfig_(chosen);
  ui.alert(
    saved.ok ? 'URL guardada en ' + PROMPTS_CONFIG_TAB_ : 'Error al guardar URL',
    saved.ok ? saved.webAppUrl : saved.error,
    ui.ButtonSet.OK
  );
}

function menuConfigurePromptsPin() {
  const ui = SpreadsheetApp.getUi();
  const promptRes = ui.prompt(
    'Configurar PIN (PROMPTS_PIN)',
    'Ingresa el PIN secreto (mínimo 4 caracteres) para autorizar llamadas externas desde GitHub Pages / Prompts PWA:',
    ui.ButtonSet.OK_CANCEL
  );
  if (promptRes.getSelectedButton() !== ui.Button.OK) return;
  const newPin = String(promptRes.getResponseText() || '').trim();
  if (newPin.length < 4) {
    ui.alert('PIN inválido', 'El PIN debe tener al menos 4 caracteres.', ui.ButtonSet.OK);
    return;
  }
  const props = PropertiesService.getScriptProperties();
  props.setProperty('PROMPTS_PIN', newPin);
  ui.alert(
    'PROMPTS_PIN guardado',
    'El PIN externo quedó guardado en ScriptProperties. Úsalo en prompts.html (panel SUBIR PROPT) para conectar de forma segura.',
    ui.ButtonSet.OK
  );
}

function menuRepairPromptsPermissions() {
  const res = handlePromptsRepairPermissions_({
    ownerEmail: getConfiguredOwnerEmail_(),
    pin: getConfiguredPromptsPin_()
  });
  const ui = SpreadsheetApp.getUi();
  if (!res.ok) {
    ui.alert('Permisos Proyecto B', res.error || 'Error al reparar permisos.', ui.ButtonSet.OK);
    return;
  }
  ui.alert(
    'Permisos reparados (solo Proyecto B)',
    'Archivos actualizados a público lectura: ' + res.updatedFiles +
    '\nCarpetas procesadas: ' + res.foldersProcessed.length +
    (res.skippedTrashed.length ? ('\nCarpetas omitidas por estar en Papelera: ' + res.skippedTrashed.length) : ''),
    ui.ButtonSet.OK
  );
}
