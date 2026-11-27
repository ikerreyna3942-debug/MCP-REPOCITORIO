// ============================================================================
// GESTOR EXCLUSIVO DE FOTOGRAFÍAS (TITULAR: kevin.reyna@grupoanipa.com)
// Hoja "1" (Col A = SKU · Col B = NOMBRE [fórmula fila 2] · Col D = LINK FOTO APP)
// Bandeja Drive "SUBIR" -> mueve a CATEGORIAS MUEBLES Y ACCESORIOS y quita de SUBIR
// ============================================================================
const OWNER_FOTOS_EMAIL_ = 'kevin.reyna@grupoanipa.com';
const SUBIR_INBOX_FOLDER_ID_ = '11_rR-qhgM02Sfx9zw7uHU5AwXvTpKD4p'; // SUBIR PREN — exclusivo Proyecto A / App #9
const CATEGORIAS_DEST_ROOT_FOLDER_ID_ = '1KZh-AzOejRbz9TdHYF52yaiuejPtT-sN';
const CATEGORIAS_DEST_FOLDERS_ = [
  { key: 'SALAS',        id: '1xo2z2bIE_HCscBiqFI8Ew-KhQacBElsb', name: 'FOTOS SALAS' },
  { key: 'SILLONES',     id: '1zqGnweu7T5-9f6dQoVXuT9MZTBPefSNm', name: 'FOTOS SILLONES' },
  { key: 'SOFA_CAMA',    id: '1nU1UgT78XiGo-OLrV4tIrxNKxy9CTd8_', name: 'FOTOS SOFÁ CAMA Y FUTTONES' },
  { key: 'MESA_CENTRO',  id: '1-KcgtpX7hVbsxFsejewVY7QT95Jzno_A', name: 'FOTOS MESA DE CENTRO' },
  { key: 'MESA_LATERAL', id: '1oRW0Mtpc7tKvDZjfrq4VCwhA332fV1lX', name: 'FOTOS MESA LATERALES' },
  { key: 'COMEDORES',    id: '1iaZaA1TXcGVL9WABWi656Xouzviiog6K', name: 'FOTOS COMEDORES' },
  { key: 'RECAMARAS',    id: '1LyU1n-4SsuJTuchYQmGYHRpcdu0gh2i6', name: 'FOTOS RECAMARAS' },
  { key: 'AUXILIARES',   id: '1peDTq6kj9iPZaxxYUId0Jw-MJmQN4aJ8', name: 'FOTOS DE AUXILIARES' },
  { key: 'ACCESORIOS',   id: '13mOw-BpuZSYpD55qPangEEXWuWW-1OL9', name: 'FOTOS ACCESORIOS Y ESPEJOS' },
  { key: 'INTERIOR',     id: '1mo5gn59M0m-psn0f6o9B1OtUHeCpz3S9', name: 'FOTOS INTERIOR' }
];
const FORBIDDEN_PROJECT_B_FOLDER_IDS_ = {
  '1Xc-gaDUJHNSd_XSTob3b39CNYoC9UreX': 'SUBIR PROPT',
  '1rwRk-bZtb8m4Hso9pCJE1A0_QiS-rqUQ': 'SUBIDA DE FOTOS',
  '1lfq8VBF1q-Kg9m6_qd2GU5zxwEywYw_B': 'fotos odoo',
  '10UIhDWLKL0ySmzdcMemA5K5831YozuBa': 'fotos odoo / FOTOS MUEBLES',
  '1z-Ne0hBzXIi1dTfJOxtz1kUUPYQQNpTR': 'fotos odoo / FOTOS ACCESORIOS Y ESPEJOS',
  '12gsKZVs6rFonOO8CIxokuE73bxhq8tS9': 'fotos odoo / FOTOS TELAS',
  '13inkyy1ZfGn7yD0ceSr6RSMquaA3OBO1': 'fotos odoo / OTROS',
  '1JKJPXcnPFPeoUOo_mBIUyl_KXM0Fn3Ul': 'TELAS',
  '1Jq2u1A6-xKi1YigUYSIzLauUww_RJ5Lx': 'MADERAS'
};

function isForbiddenProjectBFolderId_(folderId) {
  const fid = String(folderId || '').trim();
  return !!(fid && Object.prototype.hasOwnProperty.call(FORBIDDEN_PROJECT_B_FOLDER_IDS_, fid));
}

function isDestCategoryFolderId_(folderId) {
  const fid = String(folderId || '').trim();
  if (!fid) return false;
  if (fid === CATEGORIAS_DEST_ROOT_FOLDER_ID_) return true;
  for (let i = 0; i < CATEGORIAS_DEST_FOLDERS_.length; i++) {
    if (CATEGORIAS_DEST_FOLDERS_[i].id === fid) return true;
  }
  return false;
}

function isFolderOrAncestorForbiddenProjectB_(folderObj, maxDepth, ancestorMemo) {
  if (!folderObj) return false;
  const limit = (typeof maxDepth === 'number' && maxDepth > 0) ? Math.floor(maxDepth) : 8;
  const memo = (ancestorMemo && typeof ancestorMemo === 'object') ? ancestorMemo : null;
  let rootId = '';
  try {
    rootId = String((folderObj.getId && folderObj.getId()) || '').trim();
  } catch (eRootId) {
    return true; // Fail closed
  }
  if (rootId && memo && Object.prototype.hasOwnProperty.call(memo, rootId)) {
    return Boolean(memo[rootId]);
  }
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
      if (rootId && memo) memo[rootId] = true;
      return true; // Fail closed
    }
    if (isForbiddenProjectBFolderId_(fid)) {
      if (fid && memo) memo[fid] = true;
      if (rootId && memo) memo[rootId] = true;
      return true;
    }
    if (fid && memo && Object.prototype.hasOwnProperty.call(memo, fid)) {
      if (memo[fid]) {
        if (rootId) memo[rootId] = true;
        return true;
      }
      continue;
    }
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
    } catch (eParWalk) {
      if (rootId && memo) memo[rootId] = true;
      return true; // Fail closed if getParents() throws
    }
  }
  if (rootId && memo) memo[rootId] = false;
  return false;
}

function isFileInForbiddenProjectBFolder_(file, ancestorMemo) {
  if (!file) return false;
  try {
    const selfId = String((file.getId && file.getId()) || '').trim();
    if (isForbiddenProjectBFolderId_(selfId)) return true;
    const pIt = file.getParents();
    while (pIt && pIt.hasNext()) {
      const pf = pIt.next();
      if (isFolderOrAncestorForbiddenProjectB_(pf, 8, ancestorMemo)) return true;
    }
  } catch (ePar) {
    return true; // Fail closed if getParents() throws
  }
  return false;
}

function isFileInProjectAAllowedFolders_(file, precomputedInboxMap, ancestorMemo) {
  if (!file) return false;
  try {
    const selfId = String((file.getId && file.getId()) || '').trim();
    if (isForbiddenProjectBFolderId_(selfId)) return false;
    const inboxMap = precomputedInboxMap || ((resolveSubirInboxFolders_(ancestorMemo) || {}).folderIdsMap) || {};
    const pIt = file.getParents();
    let hasAllowedParent = false;
    while (pIt && pIt.hasNext()) {
      const pf = pIt.next();
      const pid = String((pf && pf.getId && pf.getId()) || '').trim();
      if (!pid) continue;
      if (isForbiddenProjectBFolderId_(pid)) return false;
      if (isFolderOrAncestorForbiddenProjectB_(pf, 8, ancestorMemo)) return false;
      if (
        pid === SUBIR_INBOX_FOLDER_ID_ ||
        inboxMap[pid] ||
        isDestCategoryFolderId_(pid) ||
        pid === FOTOS_NUEVAS_CARGADO_FOLDER_ID_
      ) {
        hasAllowedParent = true;
      }
    }
    return hasAllowedParent;
  } catch (eAllow) {
    return false; // Fail closed if getParents() throws
  }
}

function validateProjectASourceFile_(srcFile, contextLabel) {
  if (!srcFile) {
    return { ok: false, error: 'Archivo no encontrado.' };
  }
  const errForbiddenB = 'Aislamiento Proyecto A/B: no se permite operar sobre archivos pertenecientes a carpetas exclusivas de Prompts/Odoo (SUBIR PROPT / SUBIDA DE FOTOS / fotos odoo / TELAS / MADERAS).';
  const errOutsideA = 'Aislamiento Proyecto A: el archivo no pertenece a carpetas permitidas de App #9 (SUBIR PREN, CATEGORIAS MUEBLES Y ACCESORIOS o FOTOS NUEVAS CARGADO).';

  if (isFileInForbiddenProjectBFolder_(srcFile)) {
    return { ok: false, forbiddenFolder: true, error: errForbiddenB };
  }
  if (!isFileInProjectAAllowedFolders_(srcFile)) {
    return { ok: false, forbiddenFolder: true, error: errOutsideA };
  }

  let mimeLower = '';
  try {
    mimeLower = String((srcFile.getMimeType && srcFile.getMimeType()) || '').toLowerCase();
  } catch (eMime) {
    return { ok: false, forbiddenFolder: true, error: 'No se pudo validar el tipo MIME del archivo (' + String(contextLabel || 'Proyecto A') + ').' };
  }

  if (mimeLower === 'application/vnd.google-apps.shortcut') {
    let targetFile = null;
    try {
      const targetId = String((srcFile.getTargetId && srcFile.getTargetId()) || '').trim();
      if (!targetId) {
        return { ok: false, forbiddenFolder: true, error: 'Aislamiento Proyecto A/B: acceso directo sin destino válido bloqueado.' };
      }
      if (isForbiddenProjectBFolderId_(targetId)) {
        return { ok: false, forbiddenFolder: true, error: errForbiddenB };
      }
      targetFile = DriveApp.getFileById(targetId);
    } catch (eScTarget) {
      return { ok: false, forbiddenFolder: true, error: 'Aislamiento Proyecto A/B: acceso directo roto o inaccesible bloqueado.' };
    }
    if (!targetFile || (targetFile.isTrashed && targetFile.isTrashed())) {
      return { ok: false, forbiddenFolder: true, error: 'Aislamiento Proyecto A/B: el destino del acceso directo está en papelera o no es válido.' };
    }
    const targetMime = String((targetFile.getMimeType && targetFile.getMimeType()) || '').toLowerCase();
    if (targetMime === 'application/vnd.google-apps.shortcut') {
      return { ok: false, forbiddenFolder: true, error: 'Aislamiento Proyecto A/B: accesos directos encadenados no están permitidos.' };
    }
    if (isFileInForbiddenProjectBFolder_(targetFile)) {
      return { ok: false, forbiddenFolder: true, error: errForbiddenB };
    }
    if (!isFileInProjectAAllowedFolders_(targetFile)) {
      return { ok: false, forbiddenFolder: true, error: errOutsideA };
    }
  }

  return { ok: true };
}

function verifyExclusiveKevinOwner_(ss, body) {
  const authCheck = resolveAuthenticatedAdvisor_(ss || null, [], body || {});
  if (!authCheck || !authCheck.ok || !authCheck.advisor) {
    return {
      ok: false,
      authRequired: true,
      error: (authCheck && authCheck.error) || 'Sesión requerida. Inicia sesión con kevin.reyna@grupoanipa.com.'
    };
  }
  const emailNorm = String(authCheck.advisor.correo || '').trim().toLowerCase().replace(/,/g, '.');
  const perms = authCheck.advisor.adminPermissions || null;
  const isPermittedAdmin = Boolean(authCheck.advisor.isAdmin && perms && perms.fotosApp === true);
  if (emailNorm !== OWNER_FOTOS_EMAIL_ && !isPermittedAdmin) {
    return {
      ok: false,
      forbidden: true,
      error: 'Acceso exclusivo denegado: este módulo está autorizado únicamente para ' + OWNER_FOTOS_EMAIL_ + ' o administradores con VER_FOTOS_APP = SI.'
    };
  }
  if (emailNorm === OWNER_FOTOS_EMAIL_ && perms && perms.fotosApp === false) {
    return {
      ok: false,
      forbidden: true,
      error: 'El permiso VER_FOTOS_APP está desactivado para tu cuenta en CUENTAS ADMINISTRATIVAS.'
    };
  }
  return { ok: true, advisor: authCheck.advisor };
}

function normPlainFotoCat_(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveCategoryDestFolderForProduct_(categoriaRaw, tipoRaw, nombreRaw) {
  const cat = normPlainFotoCat_(categoriaRaw);
  const tp = normPlainFotoCat_(tipoRaw);
  const nom = normPlainFotoCat_(nombreRaw);
  const nomHead = nom.split(/\b(?:INCLUYE|INCL|CON\s+\d|CON\s+MESAS?\b|CON\s+SILLAS?\b|C\/\s*FUNDAS)\b/)[0].trim();
  const tpNom = (tp + ' ' + nom).trim();
  const text = (tpNom + ' ' + cat).trim();
  const byKey = (k) => CATEGORIAS_DEST_FOLDERS_.find((f) => f.key === k) || CATEGORIAS_DEST_FOLDERS_[CATEGORIAS_DEST_FOLDERS_.length - 1];

  if (/\bFUTON|\bFUTTON|SOFA\s*CAMAS?|\bSALA\s+ASHA\b/.test(text)) return byKey('SOFA_CAMA');
  if (/MESA\s+LATERAL|MESA\s+AUXILIAR/.test(tpNom) || (cat.indexOf('MESAS DE CENTRO') !== -1 && /\bLATERAL(?:ES)?\b|\bAUXILIAR(?:ES)?\b/.test(tpNom))) {
    return byKey('MESA_LATERAL');
  }
  if (/MESA\s+DE\s+CENTRO|MESA\s+CENTRO|MESA\s+CENTRAL|MESA\s+NIDO/.test(tpNom) || cat === 'MESAS DE CENTRO & LATERALES') {
    return byKey('MESA_CENTRO');
  }
  const isModularSalaModule =
    /\b(SIN\s+BRAZOS?|BRAZO\s+(?:DER(?:ECHO)?|IZQ(?:UIERDO)?)|MODULO\s+CENTRAL|ESQUINERO|CHAISE|LOVE\s*SEAT|MODULAR)\b/.test(tpNom) ||
    (cat === 'SALAS & SOFAS' && /\bSILLON(?:ES)?\b/.test(tpNom) && /\b(DER(?:ECHO)?|IZQ(?:UIERDO)?|SIN\s+BRAZOS?|CENTRAL|MODULO)\b/.test(tpNom));
  if (isModularSalaModule) {
    return byKey('SALAS');
  }
  if (/\bSILLAS?\b/.test(nomHead) && !/\b(SILLON(?:ES)?|MESAS?|COLGANTES?|COLUMPIOS?)\b/.test(nomHead) && !/^SALA\b/.test(nomHead)) {
    return byKey('COMEDORES');
  }
  if (/\b(SILLON(?:ES)?|POLTRONA|RECLINABLE|BUTACA)\b/.test(nomHead) && !/\bSILLAS?\b/.test(nomHead) && !/^SALA\b/.test(nomHead)) {
    return byKey('SILLONES');
  }
  if (/\bSILLON|\bPOLTRONA|\bRECLINABLE|\bTABURETE|\bOTTOMAN|\bPUFF\b/.test(tpNom)) {
    return byKey('SILLONES');
  }
  if (cat === 'SALAS & SOFAS' || /\bSALA\b|\bMODULAR\b|LOVE\s*SEAT|\bCHAISE\b|\bESQUINERO\b|\bSOFA\b/.test(tpNom)) {
    return byKey('SALAS');
  }
  if (
    cat === 'OFICINA' ||
    cat === 'EXTERIOR & TERRAZA' ||
    /\bOFICINA|\bOPERATIV[AO]|\bEJECUTIV[AO]|\bSECRETARIAL|\bESCRITORIO|\bCAMASTRO/.test(tpNom)
  ) {
    return byKey('AUXILIARES');
  }
  if (cat === 'COMEDORES' || /\bCOMEDOR|MESA\s+DE\s+COMEDOR|\bSILLA\b|\bBANCO\b|\bBANCA\b/.test(tpNom)) {
    return byKey('COMEDORES');
  }
  if (cat === 'RECAMARAS' || /\bCAMA\b|\bCABECERA|\bCOLCHON|\bBURO\b|\bCOMODA\b|\bCAJONERA|\bTOCADOR|PIE\s+DE\s+CAMA/.test(tpNom)) {
    return byKey('RECAMARAS');
  }
  if (
    cat === 'ACCESORIOS DECORATIVOS' ||
    cat === 'COJINES & TEXTILES' ||
    cat === 'ESPEJOS & ARTE' ||
    cat === 'ILUMINACION' ||
    /\bESPEJO|\bCUADRO|\bLAMPARA|\bCOJIN|\bFUNDA|\bPLANTA|\bFOLLAJE|\bFLORERO|\bJARRON|\bCHAROLA|\bTAPETE|\bVELA\b|\bFIGURA|\bACCESORIO/.test(tpNom)
  ) {
    return byKey('ACCESORIOS');
  }
  if (
    cat === 'BUFETERAS & CREDENZAS' ||
    cat === 'COMPLEMENTOS' ||
    /\bCREDENZA|\bBUFETERA|\bLIBRERO|MUEBLE\s+PARA\s+TV|MESA\s+DE\s+TV|\bBAR\b|\bCONSOLA|\bAUXILIAR/.test(tpNom)
  ) {
    return byKey('AUXILIARES');
  }
  return byKey('INTERIOR');
}

const PROJECT_A_PUBLIC_FOLDERS_CACHE_KEY_ = 'CREATA_PA_PUBLIC_FOLDERS_OK_V1';
const PROJECT_A_LOADED_NAMES_CACHE_KEY_ = 'CREATA_PA_LOADED_NAMES_V1';

function ensurePublicSharingWithStatus_(item) {
  if (!item) return { ok: false, changed: false };
  try {
    if (typeof item.getSharingAccess === 'function') {
      const access = item.getSharingAccess();
      if (access === DriveApp.Access.ANYONE_WITH_LINK || access === DriveApp.Access.ANYONE) {
        return { ok: true, changed: false };
      }
    }
    if (typeof item.setSharing === 'function') {
      item.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      return { ok: true, changed: true };
    }
  } catch (eShare) {}
  return { ok: false, changed: false };
}

function ensurePublicSharingItem_(item) {
  return ensurePublicSharingWithStatus_(item).ok;
}

function ensureProjectAPublicFolders_(forceNow) {
  try {
    if (!forceNow) {
      const cached = CacheService.getScriptCache().get(PROJECT_A_PUBLIC_FOLDERS_CACHE_KEY_);
      if (cached === '1') return { ok: true, cached: true, updated: 0 };
    }
  } catch (eC) {}

  let updated = 0;
  const seen = {};
  const folderIds = [
    SUBIR_INBOX_FOLDER_ID_,
    CATEGORIAS_DEST_ROOT_FOLDER_ID_,
    FOTOS_NUEVAS_CARGADO_FOLDER_ID_
  ];
  for (let i = 0; i < CATEGORIAS_DEST_FOLDERS_.length; i++) {
    if (CATEGORIAS_DEST_FOLDERS_[i] && CATEGORIAS_DEST_FOLDERS_[i].id) {
      folderIds.push(CATEGORIAS_DEST_FOLDERS_[i].id);
    }
  }

  for (let i = 0; i < folderIds.length; i++) {
    const fid = String(folderIds[i] || '').trim();
    if (!fid || seen[fid] || isForbiddenProjectBFolderId_(fid)) continue;
    seen[fid] = true;
    try {
      const fld = DriveApp.getFolderById(fid);
      if (fld && (!fld.isTrashed || !fld.isTrashed())) {
        if (!isFolderOrAncestorForbiddenProjectB_(fld, 8)) {
          if (ensurePublicSharingItem_(fld)) updated++;
          if (fid === SUBIR_INBOX_FOLDER_ID_ || fid === FOTOS_NUEVAS_CARGADO_FOLDER_ID_) {
            const subIt = fld.getFolders();
            while (subIt.hasNext()) {
              const sf = subIt.next();
              const sid = String((sf && sf.getId && sf.getId()) || '').trim();
              if (!sid || seen[sid] || isForbiddenProjectBFolderId_(sid)) continue;
              seen[sid] = true;
              if ((!sf.isTrashed || !sf.isTrashed()) && !isFolderOrAncestorForbiddenProjectB_(sf, 8)) {
                if (ensurePublicSharingItem_(sf)) updated++;
              }
            }
          }
        }
      }
    } catch (eFld) {}
  }

  try {
    CacheService.getScriptCache().put(PROJECT_A_PUBLIC_FOLDERS_CACHE_KEY_, '1', 600);
  } catch (ePut) {}
  return { ok: true, cached: false, updated: updated };
}

function lookupInvMetaFast_(ss, skuUpper) {
  const out = { nombre: '', tipo: '', categoria: '' };
  if (!ss || !skuUpper) return out;
  try {
    const shInv = ss.getSheetByName(CONFIG.TAB_INVENTORY || 'INVENTARIO_EN_VIVO');
    if (!shInv || shInv.getLastRow() < 3) return out;
    const colARng = shInv.getRange(3, 1, shInv.getLastRow() - 2, 1);
    if (typeof colARng.createTextFinder === 'function') {
      const hit = colARng.createTextFinder(skuUpper).matchEntireCell(true).matchCase(false).findNext();
      if (hit) {
        const r = shInv.getRange(hit.getRow(), 1, 1, 7).getValues()[0];
        return {
          tipo: cleanInvCell_(r[1]),
          nombre: cleanInvCell_(r[3]),
          categoria: cleanInvCell_(r[6])
        };
      }
      return out;
    }
    const invVals = shInv.getRange(3, 1, shInv.getLastRow() - 2, 7).getValues();
    for (let i = 0; i < invVals.length; i++) {
      if (cleanInvCell_(invVals[i][0]).toUpperCase() === skuUpper) {
        return {
          tipo: cleanInvCell_(invVals[i][1]),
          nombre: cleanInvCell_(invVals[i][3]),
          categoria: cleanInvCell_(invVals[i][6])
        };
      }
    }
  } catch (eInvFast) {}
  return out;
}

function parseUploadImageDataUrl_(dataUrl, rawNameInput, fallbackStem) {
  const s = String(dataUrl || '').trim();
  const m = s.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!m) {
    return { ok: false, error: 'Formato de imagen inválido.' };
  }
  const mime = m[1];
  const base64Body = m[2];
  const ext = mime.indexOf('webp') !== -1 ? 'webp' : (mime.indexOf('png') !== -1 ? 'png' : 'jpg');
  const cleanRaw = String(rawNameInput || '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
  const baseName = cleanRaw || ((fallbackStem || ('foto-' + Date.now())) + '.' + ext);
  const finalName = /\.[a-z0-9]{2,5}$/i.test(baseName) ? baseName : (baseName + '.' + ext);
  const bytes = Utilities.base64Decode(base64Body);
  return {
    ok: true,
    mime: mime,
    ext: ext,
    fileName: finalName,
    blob: Utilities.newBlob(bytes, mime, finalName)
  };
}

function classifySubirInboxFileType_(mimeRaw, fileNameRaw) {
  const mime = String(mimeRaw || '').trim().toLowerCase();
  const name = String(fileNameRaw || '').trim();
  const extMatch = name.match(/\.([a-z0-9]{2,5})$/i);
  const nameExt = extMatch && extMatch[1] ? extMatch[1].toLowerCase() : '';

  const imgExtRe = /^(jpe?g|png|webp|gif|avif|bmp|heic|heif|tiff?)$/;
  const docMimeByExt = {
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    csv: 'text/csv',
    txt: 'text/plain',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    zip: 'application/zip'
  };
  const docExtByMime = {
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'text/csv': 'csv',
    'application/csv': 'csv',
    'text/plain': 'txt',
    'application/vnd.ms-powerpoint': 'ppt',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
    'application/zip': 'zip',
    'application/x-zip-compressed': 'zip'
  };
  const imgMimeByExt = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
    avif: 'image/avif',
    bmp: 'image/bmp',
    heic: 'image/heic',
    heif: 'image/heif',
    tif: 'image/tiff',
    tiff: 'image/tiff'
  };

  const isImg = (mime.indexOf('image/') === 0) || (nameExt && imgExtRe.test(nameExt));
  if (isImg) {
    let ext = nameExt && imgExtRe.test(nameExt) ? nameExt : '';
    if (!ext) {
      if (mime.indexOf('webp') !== -1) ext = 'webp';
      else if (mime.indexOf('png') !== -1) ext = 'png';
      else if (mime.indexOf('gif') !== -1) ext = 'gif';
      else if (mime.indexOf('avif') !== -1) ext = 'avif';
      else if (mime.indexOf('heic') !== -1) ext = 'heic';
      else if (mime.indexOf('heif') !== -1) ext = 'heif';
      else if (mime.indexOf('bmp') !== -1) ext = 'bmp';
      else if (mime.indexOf('tiff') !== -1) ext = 'tiff';
      else ext = 'jpg';
    }
    const resolvedImgMime = mime.indexOf('image/') === 0 ? mime : (imgMimeByExt[ext] || 'image/jpeg');
    return { ok: true, kind: 'image', ext: ext, mime: resolvedImgMime };
  }

  if (nameExt && Object.prototype.hasOwnProperty.call(docMimeByExt, nameExt)) {
    const resolvedDocMime = (mime && mime !== 'application/octet-stream' && Object.prototype.hasOwnProperty.call(docExtByMime, mime) && !(nameExt === 'csv' && mime === 'application/vnd.ms-excel'))
      ? mime
      : docMimeByExt[nameExt];
    return { ok: true, kind: 'document', ext: nameExt, mime: resolvedDocMime };
  }
  if (mime && Object.prototype.hasOwnProperty.call(docExtByMime, mime)) {
    const extFromMime = docExtByMime[mime];
    return { ok: true, kind: 'document', ext: extFromMime, mime: docMimeByExt[extFromMime] || mime };
  }
  return { ok: false };
}

function parseUploadFileDataUrl_(dataUrl, fallbackName, fallbackStem) {
  const s = String(dataUrl || '').trim();
  const m = s.match(/^data:([a-zA-Z0-9.+\-]+\/[a-zA-Z0-9.+\-]+)?(?:;[^,]+)?;base64,([A-Za-z0-9+/=\s]+)$/);
  if (!m) {
    return { ok: false, error: 'Formato de archivo inválido (se requiere data URL en base64).' };
  }
  const rawMime = String(m[1] || '').trim().toLowerCase();
  const cleanB64 = String(m[2] || '').replace(/\s+/g, '');
  const MAX_BYTES = 15 * 1024 * 1024;
  if (!cleanB64) {
    return { ok: false, error: 'El archivo está vacío.' };
  }
  if (cleanB64.length > Math.ceil((MAX_BYTES * 4) / 3) + 16) {
    return { ok: false, error: 'El archivo excede el límite máximo permitido de 15 MB.' };
  }

  const cleanRaw = String(fallbackName || '')
    .replace(/(?:^|[\\/])\.\.(?=[\\/]|$)/g, ' ')
    .replace(/\.\.+/g, '.')
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/[\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .trim();

  const classified = classifySubirInboxFileType_(rawMime, cleanRaw);
  if (!classified.ok) {
    return {
      ok: false,
      error: 'Tipo de archivo no permitido. Usa fotos o documentos (.pdf, .doc, .docx, .xls, .xlsx, .csv, .txt, .ppt, .pptx, .zip).'
    };
  }

  const bytes = Utilities.base64Decode(cleanB64);
  if (!bytes || !bytes.length) {
    return { ok: false, error: 'El archivo está vacío.' };
  }
  if (bytes.length > MAX_BYTES) {
    return { ok: false, error: 'El archivo excede el límite máximo permitido de 15 MB.' };
  }

  const stemDefault = String(fallbackStem || ((classified.kind === 'image' ? 'foto-' : 'doc-') + Date.now()));
  const baseName = cleanRaw || (stemDefault + '.' + classified.ext);
  const finalName = /\.[a-z0-9]{2,5}$/i.test(baseName) ? baseName : (baseName + '.' + classified.ext);
  return {
    ok: true,
    kind: classified.kind,
    mime: classified.mime,
    ext: classified.ext,
    fileName: finalName,
    sizeBytes: bytes.length,
    blob: Utilities.newBlob(bytes, classified.mime, finalName)
  };
}

function getFotosInboxRev_() {
  const KEY = 'FOTOS_INBOX_REV_V1';
  try {
    const cVal = CacheService.getScriptCache().get(KEY);
    if (cVal) return String(cVal);
  } catch (eC) {}
  try {
    const pVal = PropertiesService.getScriptProperties().getProperty(KEY);
    if (pVal) {
      const sVal = String(pVal);
      try { CacheService.getScriptCache().put(KEY, sVal, 300); } catch (eC2) {}
      return sVal;
    }
  } catch (eP) {}
  try { CacheService.getScriptCache().put(KEY, '1', 300); } catch (eC3) {}
  return '1';
}

function invalidateFotosInboxSnapshotCache_(revToClear) {
  try {
    const cache = CacheService.getScriptCache();
    const r = String(revToClear || '').trim();
    if (r) {
      cache.remove('FOTOS_INBOX_META_V1_' + r);
      cache.remove('FOTOS_INBOX_SNAP_F_V1_' + r);
      cache.remove('FOTOS_INBOX_SNAP_T_V1_' + r);
    }
  } catch (eInv) {}
}

function bumpFotosInboxRev_() {
  const KEY = 'FOTOS_INBOX_REV_V1';
  const prevRev = getFotosInboxRev_();
  const prevSeq = parseInt(String(prevRev || '1').split('-')[0], 10) || 1;
  const nextRev = String(prevSeq + 1) + '-' + String(Date.now());
  invalidateFotosInboxSnapshotCache_(prevRev);
  try { PropertiesService.getScriptProperties().setProperty(KEY, nextRev); } catch (eP) {}
  try { CacheService.getScriptCache().put(KEY, nextRev, 300); } catch (eC) {}
  return nextRev;
}

function hydrateFotosRecentUpload_(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const fid = String(raw.fileId || raw.id || '').trim();
  if (!fid) return null;
  const kind = String(raw.kind || 'image').toLowerCase() === 'document' ? 'document' : 'image';
  const targetKey = String(raw.targetKey || 'INBOX').trim().toUpperCase().slice(0, 80);
  return {
    id: fid,
    fileId: fid,
    targetKey: targetKey,
    targetLabel: String(raw.targetLabel || raw.fileName || targetKey).trim().slice(0, 120),
    targetKind: String(raw.targetKind || (kind === 'document' ? 'DOCUMENTO' : 'SKU')).trim().slice(0, 24),
    kind: kind,
    ext: String(raw.ext || '').trim().toLowerCase().slice(0, 8),
    fileName: String(raw.fileName || '').trim().slice(0, 120),
    viewUrl: String(raw.viewUrl || ('https://drive.google.com/file/d/' + fid + '/view?usp=sharing')).trim().slice(0, 180),
    downloadUrl: String(raw.downloadUrl || ('https://drive.google.com/uc?export=download&id=' + fid)).trim().slice(0, 180),
    thumbUrl: kind === 'image' ? String(raw.thumbUrl || ('https://lh3.googleusercontent.com/d/' + fid + '=w800')).trim().slice(0, 180) : '',
    destFolderName: String(raw.destFolderName || '').trim().slice(0, 64),
    actorEmail: String(raw.actorEmail || '').trim().toLowerCase().slice(0, 80),
    ts: Number(raw.ts || 0) || 0
  };
}

function compactFotosRecentUploadForStore_(raw) {
  const rec = hydrateFotosRecentUpload_(raw);
  if (!rec) return null;
  const compact = {
    id: rec.id,
    targetKey: rec.targetKey,
    targetLabel: rec.targetLabel,
    targetKind: rec.targetKind,
    kind: rec.kind,
    ext: rec.ext,
    fileName: rec.fileName,
    destFolderName: rec.destFolderName,
    actorEmail: rec.actorEmail,
    ts: rec.ts
  };
  const defView = 'https://drive.google.com/file/d/' + rec.id + '/view?usp=sharing';
  const defDl = 'https://drive.google.com/uc?export=download&id=' + rec.id;
  const defThumb = 'https://lh3.googleusercontent.com/d/' + rec.id + '=w800';
  if (rec.viewUrl && rec.viewUrl !== defView) compact.viewUrl = rec.viewUrl;
  if (rec.downloadUrl && rec.downloadUrl !== defDl) compact.downloadUrl = rec.downloadUrl;
  if (rec.kind === 'image' && rec.thumbUrl && rec.thumbUrl !== defThumb) compact.thumbUrl = rec.thumbUrl;
  return compact;
}

function readFotosRecentUploads_() {
  const KEY = 'FOTOS_RECENT_UPLOADS_V1';
  try {
    const cRaw = CacheService.getScriptCache().get(KEY);
    if (cRaw) {
      const parsed = JSON.parse(cRaw);
      if (Array.isArray(parsed)) return parsed.map(hydrateFotosRecentUpload_).filter(Boolean);
    }
  } catch (eC) {}
  try {
    const pRaw = PropertiesService.getScriptProperties().getProperty(KEY);
    if (pRaw) {
      const parsed = JSON.parse(pRaw);
      if (Array.isArray(parsed)) {
        try { CacheService.getScriptCache().put(KEY, pRaw, 300); } catch (eC2) {}
        return parsed.map(hydrateFotosRecentUpload_).filter(Boolean);
      }
    }
  } catch (eP) {}
  return [];
}

function writeFotosRecentUploads_(list) {
  const KEY = 'FOTOS_RECENT_UPLOADS_V1';
  const cleanCompact = (Array.isArray(list) ? list : [])
    .slice(0, 24)
    .map(compactFotosRecentUploadForStore_)
    .filter(Boolean);
  let json = JSON.stringify(cleanCompact);
  const byteLenFn = (typeof utf8ByteLength_ === 'function') ? utf8ByteLength_ : function (x) { return String(x || '').length; };
  while (cleanCompact.length > 1 && byteLenFn(json) > 8200) {
    cleanCompact.pop();
    json = JSON.stringify(cleanCompact);
  }
  try { PropertiesService.getScriptProperties().setProperty(KEY, json); } catch (eP) {}
  try { CacheService.getScriptCache().put(KEY, json, 300); } catch (eC) {}
  return cleanCompact.map(hydrateFotosRecentUpload_).filter(Boolean);
}

function recordFotosRecentUpload_(entry) {
  try {
    if (!entry || typeof entry !== 'object') return readFotosRecentUploads_();
    const fid = String(entry.fileId || entry.id || '').trim();
    if (!fid) return readFotosRecentUploads_();
    const kind = String(entry.kind || 'image').toLowerCase() === 'document' ? 'document' : 'image';
    const targetKey = String(entry.targetKey || entry.sku || entry.overrideKey || 'INBOX').trim().toUpperCase().slice(0, 80);
    const rec = hydrateFotosRecentUpload_({
      id: fid,
      fileId: fid,
      targetKey: targetKey,
      targetLabel: String(entry.targetLabel || entry.productName || entry.label || entry.fileName || targetKey).trim().slice(0, 120),
      targetKind: String(entry.targetKind || (kind === 'document' ? 'DOCUMENTO' : 'SKU')).trim().slice(0, 24),
      kind: kind,
      ext: String(entry.ext || '').trim().toLowerCase().slice(0, 8),
      fileName: String(entry.fileName || '').trim().slice(0, 120),
      viewUrl: entry.viewUrl || '',
      downloadUrl: entry.downloadUrl || '',
      thumbUrl: entry.thumbUrl || '',
      destFolderName: String(entry.destFolderName || '').trim().slice(0, 64),
      actorEmail: String(entry.actorEmail || '').trim().toLowerCase().slice(0, 80),
      ts: Number(entry.ts || Date.now()) || Date.now()
    });
    if (!rec) return readFotosRecentUploads_();
    const prev = readFotosRecentUploads_();
    const dedupKey = rec.id + ':' + rec.targetKey;
    const merged = [rec].concat(prev.filter(function (it) {
      if (!it || !it.id) return false;
      return (String(it.id) + ':' + String(it.targetKey || '')) !== dedupKey;
    }));
    return writeFotosRecentUploads_(merged);
  } catch (eRec) {
    return readFotosRecentUploads_();
  }
}

function removeFotosRecentUploadByFileId_(fileId) {
  try {
    const fid = String(fileId || '').trim();
    if (!fid) return readFotosRecentUploads_();
    const prev = readFotosRecentUploads_();
    const filtered = prev.filter(function (it) { return it && String(it.id || it.fileId || '') !== fid; });
    if (filtered.length !== prev.length) {
      return writeFotosRecentUploads_(filtered);
    }
    return prev;
  } catch (eRm) {
    return readFotosRecentUploads_();
  }
}

function cleanDuplicatesInSubirInbox_(movedFile, origName, shortcutFileId, resolvedInbox) {
  let removed = 0;
  try {
    const resolved = resolvedInbox || resolveSubirInboxFolders_();
    const inboxFolders = resolved.folders || [];
    const inboxMap = Object.assign({}, resolved.folderIdsMap || {});
    inboxMap[SUBIR_INBOX_FOLDER_ID_] = true;
    const movedId = movedFile && typeof movedFile.getId === 'function' ? String(movedFile.getId() || '').trim() : '';

    // 1) Asegurar que el archivo movido ya no tenga ningún padre dentro de SUBIR PREN
    if (movedFile && typeof movedFile.getParents === 'function') {
      try {
        const pIt = movedFile.getParents();
        while (pIt.hasNext()) {
          const pf = pIt.next();
          const pid = String((pf && pf.getId && pf.getId()) || '').trim();
          if (pid && inboxMap[pid] && !isDestCategoryFolderId_(pid) && !isForbiddenProjectBFolderId_(pid)) {
            try { pf.removeFile(movedFile); removed++; } catch (eRem1) {}
          }
        }
      } catch (ePar) {}
    }

    // 2) Si venía de un acceso directo en SUBIR PREN, enviar a papelera únicamente ese acceso directo exacto
    const cleanScId = String(shortcutFileId || '').trim();
    if (cleanScId && cleanScId !== movedId && !isForbiddenProjectBFolderId_(cleanScId)) {
      try {
        const scFile = DriveApp.getFileById(cleanScId);
        if (scFile && !scFile.isTrashed() && String(scFile.getMimeType() || '').toLowerCase() === 'application/vnd.google-apps.shortcut') {
          if (isFileInProjectAAllowedFolders_(scFile, inboxMap) && !isFileInForbiddenProjectBFolder_(scFile)) {
            scFile.setTrashed(true);
            removed++;
          }
        }
      } catch (eScTrash) {}
    }

    // 3) Limpiar referencias exactas al mismo movedId, accesos directos hacia movedId, y copias duplicadas
    //    con nombre descriptivo exacto dentro de SUBIR PREN (NUNCA borrar nombres genéricos de cámara como "image.jpg" de iOS)
    const cleanNameLower = String(origName || '').trim().toLowerCase();
    const isGenericCameraName = !cleanNameLower || /^(?:image|photo|foto|img|dsc|pxl|screenshot|captura)(?:[\s_-]*\d*)?\.(?:jpe?g|png|heic|heif|webp)$/i.test(cleanNameLower);
    if (movedId) {
      for (let i = 0; i < inboxFolders.length; i++) {
        const folder = inboxFolders[i];
        if (!folder) continue;
        const fidFolder = String((folder.getId && folder.getId()) || '').trim();
        if (!fidFolder || isDestCategoryFolderId_(fidFolder) || isForbiddenProjectBFolderId_(fidFolder)) continue;
        try {
          const fIt = folder.getFiles();
          while (fIt.hasNext()) {
            const cand = fIt.next();
            if (!cand || cand.isTrashed()) continue;
            const cid = String((cand.getId && cand.getId()) || '').trim();
            if (!cid || isForbiddenProjectBFolderId_(cid)) continue;
            if (cid === movedId) {
              try { folder.removeFile(cand); removed++; } catch (eRemSame) {}
              continue;
            }
            const cMime = String((cand.getMimeType && cand.getMimeType()) || '').toLowerCase();
            const isTargetShortcut = cMime === 'application/vnd.google-apps.shortcut' && String((cand.getTargetId && cand.getTargetId()) || '').trim() === movedId;
            const cNameLower = String((cand.getName && cand.getName()) || '').trim().toLowerCase();
            const isDescriptiveDuplicate = !isGenericCameraName && cNameLower && cNameLower === cleanNameLower;
            if (isTargetShortcut || isDescriptiveDuplicate) {
              try {
                let inDest = false;
                const cpIt = cand.getParents();
                while (cpIt.hasNext()) {
                  const cpf = cpIt.next();
                  if (cpf && isDestCategoryFolderId_(cpf.getId())) { inDest = true; break; }
                }
                if (!inDest && !isFileInForbiddenProjectBFolder_(cand)) {
                  cand.setTrashed(true);
                  removed++;
                } else if (inDest) {
                  folder.removeFile(cand);
                  removed++;
                }
              } catch (eDup) {}
            }
          }
        } catch (eScanInb) {}
      }
    }
  } catch (eCleanAll) {}
  return removed;
}

function collectLoadedFileNamesMap_(forceRefresh) {
  try {
    if (!forceRefresh) {
      const cached = CacheService.getScriptCache().get(PROJECT_A_LOADED_NAMES_CACHE_KEY_);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    }
  } catch (eC) {}

  const map = {};
  const startMs = Date.now();
  const MAX_MS = 4500;
  const folderIds = CATEGORIAS_DEST_FOLDERS_.map((f) => f.id);
  folderIds.push(FOTOS_NUEVAS_CARGADO_FOLDER_ID_);

  for (let i = 0; i < folderIds.length; i++) {
    if ((Date.now() - startMs) > MAX_MS) break;
    const fid = folderIds[i];
    if (!fid || isForbiddenProjectBFolderId_(fid)) continue;
    try {
      const fld = DriveApp.getFolderById(fid);
      if (!fld || (fld.isTrashed && fld.isTrashed())) continue;
      const it = fld.getFiles();
      let count = 0;
      while (it.hasNext() && count < 450 && (Date.now() - startMs) <= MAX_MS) {
        const f = it.next();
        if (!f || (f.isTrashed && f.isTrashed())) continue;
        const id = String(f.getId() || '').trim();
        const nm = String(f.getName() || '').trim();
        if (id && nm) {
          map[id] = nm;
          count++;
        }
      }
    } catch (eF) {}
  }

  try {
    const serialized = JSON.stringify(map);
    const byteLen = (typeof utf8ByteLength_ === 'function') ? utf8ByteLength_(serialized) : serialized.length;
    if (byteLen < 95000) {
      CacheService.getScriptCache().put(PROJECT_A_LOADED_NAMES_CACHE_KEY_, serialized, 300);
    }
  } catch (ePut) {}
  return map;
}

function invalidateLoadedFileNamesCache_() {
  try { CacheService.getScriptCache().remove(PROJECT_A_LOADED_NAMES_CACHE_KEY_); } catch (e) {}
}

function resolveSubirInboxFolders_(ancestorMemo) {
  const folders = [];
  const folderIdsMap = {};
  let primaryFolder = null;

  function addFolderSafe(folderObj) {
    if (!folderObj) return;
    try {
      if (folderObj.isTrashed && folderObj.isTrashed()) return;
      const fid = String(folderObj.getId() || '').trim();
      if (!fid || folderIdsMap[fid]) return;
      if (isForbiddenProjectBFolderId_(fid) || isFolderOrAncestorForbiddenProjectB_(folderObj, 8, ancestorMemo)) return;
      if (isDestCategoryFolderId_(fid)) return;
      folderIdsMap[fid] = true;
      folders.push(folderObj);
      if (!primaryFolder) primaryFolder = folderObj;
    } catch (eAddF) {}
  }

  try {
    const baseSubir = DriveApp.getFolderById(SUBIR_INBOX_FOLDER_ID_); // SUBIR PREN (exclusivo Proyecto A)
    addFolderSafe(baseSubir);
    if (baseSubir && !baseSubir.isTrashed() && folderIdsMap[SUBIR_INBOX_FOLDER_ID_]) {
      primaryFolder = baseSubir;
    }
  } catch (eBase) {}

  // Solo subcarpetas directas dentro de SUBIR PREN (protegidas contra IDs prohibidos de Proyecto B y categorías destino)
  const rootCount = folders.length;
  for (let i = 0; i < rootCount; i++) {
    try {
      const subIt = folders[i].getFolders();
      while (subIt.hasNext()) {
        const sub = subIt.next();
        if (!sub.isTrashed()) addFolderSafe(sub);
      }
    } catch (eSub) {}
  }

  return {
    primaryFolder: primaryFolder,
    folders: folders,
    folderIdsMap: folderIdsMap
  };
}

function listSubirInboxFilesInternal_(opts) {
  const includeThumbs = !!(opts && opts.includeThumbs);
  const startListMs = Date.now();
  const ancestorMemo = (opts && opts.ancestorMemo) ? opts.ancestorMemo : {};
  ensureProjectAPublicFolders_(false);
  const resolved = (opts && opts.resolvedInbox) ? opts.resolvedInbox : resolveSubirInboxFolders_(ancestorMemo);
  const inboxFolders = resolved.folders || [];
  const inboxMap = resolved.folderIdsMap || {};
  const seenFileIds = {};
  const rawItems = [];

  for (let fIdx = 0; fIdx < inboxFolders.length; fIdx++) {
    const folder = inboxFolders[fIdx];
    let it = null;
    try {
      it = folder.getFiles();
    } catch (eIt) {
      continue;
    }
    while (it && it.hasNext()) {
      let f = it.next();
      let shortcutId = '';
      try {
        if (!f || f.isTrashed()) continue;
        let mime = String(f.getMimeType() || '').toLowerCase();
        if (mime === 'application/vnd.google-apps.shortcut') {
          let targetFile = null;
          try {
            shortcutId = String(f.getId() || '').trim();
            const targetId = String((f.getTargetId && f.getTargetId()) || '').trim();
            if (!targetId || isForbiddenProjectBFolderId_(targetId)) continue;
            targetFile = DriveApp.getFileById(targetId);
          } catch (eSc) {
            continue;
          }
          if (!targetFile || (targetFile.isTrashed && targetFile.isTrashed())) continue;
          f = targetFile;
          mime = String(f.getMimeType() || '').toLowerCase();
          if (mime === 'application/vnd.google-apps.shortcut') continue;
        }
        const fid = String(f.getId() || '').trim();
        if (!fid || seenFileIds[fid]) continue;
        if (!isFileInProjectAAllowedFolders_(f, inboxMap, ancestorMemo)) continue;
        const name = String(f.getName() || '').trim();
        const classified = classifySubirInboxFileType_(mime, name);
        if (!classified.ok) continue;
        seenFileIds[fid] = true;
        if ((Date.now() - startListMs) < 900) {
          ensurePublicSharingItem_(f);
        }
        const updated = f.getLastUpdated();
        rawItems.push({
          fileObj: f,
          id: fid,
          shortcutId: shortcutId,
          name: name,
          kind: classified.kind,
          ext: classified.ext,
          mimeType: classified.mime,
          sizeBytes: Number(f.getSize() || 0) || 0,
          updatedAt: updated ? updated.toISOString() : ''
        });
      } catch (eItem) {}
    }
  }

  rawItems.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')) || String(a.name || '').localeCompare(String(b.name || ''), 'es'));

  const files = [];
  let imgThumbCount = 0;
  for (let i = 0; i < rawItems.length; i++) {
    const item = rawItems[i];
    const f = item.fileObj;
    const isImg = (item.kind === 'image');
    let thumbDataUrl = '';
    if (includeThumbs && isImg && imgThumbCount < 16) {
      imgThumbCount++;
      try {
        const tb = f.getThumbnail();
        if (tb) {
          const ct = String(tb.getContentType() || 'image/png');
          thumbDataUrl = 'data:' + ct + ';base64,' + Utilities.base64Encode(tb.getBytes());
        }
      } catch (eTb) {}
    }
    files.push({
      id: item.id,
      shortcutId: item.shortcutId || '',
      name: item.name,
      kind: item.kind,
      ext: item.ext,
      mimeType: item.mimeType,
      sizeBytes: item.sizeBytes,
      updatedAt: item.updatedAt,
      viewUrl: 'https://drive.google.com/file/d/' + item.id + '/view?usp=sharing',
      downloadUrl: 'https://drive.google.com/uc?export=download&id=' + item.id,
      thumbUrl: isImg ? ('https://lh3.googleusercontent.com/d/' + item.id + '=w800') : '',
      thumbDataUrl: thumbDataUrl
    });
  }
  return files;
}

function sincronizarSkusHoja1DesdeInventario_(ss, flushNow, optsInternal) {
  const book = ss || getSpreadsheet_();
  const sh1 = book.getSheetByName('1');
  const shInv = book.getSheetByName(CONFIG.TAB_INVENTORY || 'INVENTARIO_EN_VIVO');
  if (!sh1 || !shInv || shInv.getLastRow() < 3) {
    return { ok: false, added: 0, totalHoja1: 0 };
  }

  const invRows = shInv.getRange(3, 1, shInv.getLastRow() - 2, 1).getDisplayValues();
  const skipLock = Boolean(optsInternal && optsInternal.skipLock === true);
  let lock = null;
  if (!skipLock) {
    const lockState = acquireScriptLockSafe_(8000);
    if (!lockState.ok) {
      return { ok: false, retryable: true, added: 0, totalHoja1: 0 };
    }
    lock = lockState.lock;
  }
  try {
    const maxRows1 = Math.max(3, sh1.getLastRow());
    const vals1 = sh1.getRange(1, 1, maxRows1, 1).getDisplayValues();
    const existingSet = {};
    let lastSkuRowInColA = 2; // Jamás tocar Fila 1 (encabezados) ni Fila 2 (ARRAYFORMULA B2, C2, E2, F2)
    let totalExisting = 0;

    for (let i = 2; i < vals1.length; i++) {
      const sk = String((vals1[i] && vals1[i][0]) || '').trim().toUpperCase();
      if (sk && sk !== 'SKU') {
        lastSkuRowInColA = i + 1;
        if (!existingSet[sk]) {
          existingSet[sk] = true;
          totalExisting++;
        }
      }
    }

    const toAppend = [];
    for (let j = 0; j < invRows.length; j++) {
      const raw = String((invRows[j] && invRows[j][0]) || '').trim();
      const sk = raw.toUpperCase();
      if (!sk || sk === 'SKU') continue;
      if (!existingSet[sk]) {
        existingSet[sk] = true;
        toAppend.push([sk]);
      }
    }

    if (toAppend.length > 0) {
      const startRow = Math.max(3, lastSkuRowInColA + 1);
      const endRow = startRow + toAppend.length - 1;
      if (sh1.getMaxRows() < endRow) {
        sh1.insertRowsAfter(sh1.getMaxRows(), endRow - sh1.getMaxRows());
      }
      const writeRng = sh1.getRange(startRow, 1, toAppend.length, 1);
      writeRng.setNumberFormat('@');
      writeRng.setValues(toAppend);
      if (flushNow) SpreadsheetApp.flush();
    }

    return {
      ok: true,
      added: toAppend.length,
      totalHoja1: totalExisting + toAppend.length
    };
  } finally {
    if (lock) {
      try { lock.releaseLock(); } catch (eRel1) {}
    }
  }
}

function handleFotosSubirList_(body) {
  const ss = getSpreadsheet_();
  const auth = verifyExclusiveKevinOwner_(ss, body);
  if (!auth.ok) return auth;

  let pendingDeletesProcessed = false;
  let hadPendingDeletes = false;
  if (body && body.pendingDeletes && typeof body.pendingDeletes === 'object') {
    const startPendMs = Date.now();
    const MAX_PEND_MS = 8000;
    try {
      const pd = body.pendingDeletes;
      const pSkus = Array.isArray(pd.skus) ? pd.skus : [];
      const pFiles = Array.isArray(pd.fileIds) ? pd.fileIds : [];
      hadPendingDeletes = (pSkus.length > 0 || pFiles.length > 0);
      let allCompleted = true;
      for (let i = 0; i < pSkus.length; i++) {
        if ((Date.now() - startPendMs) > MAX_PEND_MS) { allCompleted = false; break; }
        if (pSkus[i]) handleFotosDelete_(Object.assign({}, body, { sku: pSkus[i], skipListReturn: true }));
      }
      for (let j = 0; j < pFiles.length; j++) {
        if ((Date.now() - startPendMs) > MAX_PEND_MS) { allCompleted = false; break; }
        const pfid = String(pFiles[j] || '').trim();
        if (!pfid) continue;
        try {
          const checkF = DriveApp.getFileById(pfid);
          if (!checkF || checkF.isTrashed()) continue;
        } catch (eMissF) {
          continue;
        }
        handleFotosDelete_(Object.assign({}, body, { driveFileId: pfid, source: 'INBOX', skipListReturn: true }));
      }
      pendingDeletesProcessed = allCompleted;
    } catch (ePend) {}
  }

  let skuSync = { added: 0, totalHoja1: 0 };
  if (body && body.syncSkus) {
    try {
      skuSync = sincronizarSkusHoja1DesdeInventario_(ss, false) || skuSync;
    } catch (eSync1) {}
  }

  const currentRev = getFotosInboxRev_();
  const recentUploads = readFotosRecentUploads_();
  const sinceRev = String((body && body.sinceRev) || '').trim();
  const forceRefresh = !!(body && body.forceRefresh);
  const includeThumbs = !!(body && body.includeThumbs);
  const includeLoadedNames = !!(body && body.includeLoadedNames);
  const metaCacheKey = 'FOTOS_INBOX_META_V1_' + currentRev;
  const snapCacheKey = 'FOTOS_INBOX_SNAP_' + (includeThumbs ? 'T' : 'F') + '_V1_' + currentRev;

  // Fast path cero DriveApp: si sinceRev coincide con la revisión actual y la caché de 15s está fresca
  if (sinceRev && sinceRev === currentRev && !forceRefresh && !hadPendingDeletes && !(body && body.syncSkus) && !includeLoadedNames) {
    try {
      const metaRaw = CacheService.getScriptCache().get(metaCacheKey);
      if (metaRaw) {
        const meta = JSON.parse(metaRaw);
        if (meta && typeof meta === 'object') {
          const cachedPrimaryId = String(meta.primaryId || SUBIR_INBOX_FOLDER_ID_);
          return {
            ok: true,
            unchanged: true,
            rev: currentRev,
            pendingCount: Number(meta.pendingCount || 0) || 0,
            recentUploads: recentUploads,
            pendingDeletesProcessed: pendingDeletesProcessed,
            inboxFolderId: cachedPrimaryId,
            inboxFolderUrl: 'https://drive.google.com/drive/folders/' + cachedPrimaryId,
            destRootFolderId: CATEGORIAS_DEST_ROOT_FOLDER_ID_,
            destRootFolderUrl: 'https://drive.google.com/drive/folders/' + CATEGORIAS_DEST_ROOT_FOLDER_ID_,
            destFolders: CATEGORIAS_DEST_FOLDERS_,
            hoja1SkusAdded: skuSync.added || 0,
            hoja1TotalSkus: skuSync.totalHoja1 || 0
          };
        }
      }
    } catch (eMetaFast) {}
  }

  // Snapshot cache hit (15s keyed by rev) para múltiples dispositivos simultáneos sin repetir DriveApp
  if (!forceRefresh && !hadPendingDeletes) {
    try {
      const snapRaw = CacheService.getScriptCache().get(snapCacheKey);
      if (snapRaw) {
        const snap = JSON.parse(snapRaw);
        if (snap && Array.isArray(snap.files)) {
          const cachedPrimaryId = String(snap.primaryId || SUBIR_INBOX_FOLDER_ID_);
          const loadedFileNames = includeLoadedNames ? collectLoadedFileNamesMap_(false) : undefined;
          return {
            ok: true,
            unchanged: false,
            fromCache: true,
            rev: currentRev,
            pendingCount: snap.files.length,
            recentUploads: recentUploads,
            pendingDeletesProcessed: pendingDeletesProcessed,
            inboxFolderId: cachedPrimaryId,
            inboxFolderUrl: 'https://drive.google.com/drive/folders/' + cachedPrimaryId,
            destRootFolderId: CATEGORIAS_DEST_ROOT_FOLDER_ID_,
            destRootFolderUrl: 'https://drive.google.com/drive/folders/' + CATEGORIAS_DEST_ROOT_FOLDER_ID_,
            destFolders: CATEGORIAS_DEST_FOLDERS_,
            hoja1SkusAdded: skuSync.added || 0,
            hoja1TotalSkus: skuSync.totalHoja1 || 0,
            files: snap.files,
            loadedFileNames: loadedFileNames
          };
        }
      }
    } catch (eSnapRead) {}
  }

  ensureProjectAPublicFolders_(false);
  const ancestorMemo = {};
  const resolved = resolveSubirInboxFolders_(ancestorMemo);
  const primaryId = (resolved.primaryFolder && resolved.primaryFolder.getId()) || SUBIR_INBOX_FOLDER_ID_;
  const files = listSubirInboxFilesInternal_({
    includeThumbs: includeThumbs,
    resolvedInbox: resolved,
    ancestorMemo: ancestorMemo
  });

  try {
    const cache = CacheService.getScriptCache();
    cache.put(metaCacheKey, JSON.stringify({ primaryId: primaryId, pendingCount: files.length }), 15);
    const snapJson = JSON.stringify({ primaryId: primaryId, files: files });
    const snapBytes = (typeof utf8ByteLength_ === 'function') ? utf8ByteLength_(snapJson) : snapJson.length;
    if (snapBytes < 95000) {
      cache.put(snapCacheKey, snapJson, 15);
    }
  } catch (eSnapPut) {}

  const loadedFileNames = includeLoadedNames ? collectLoadedFileNamesMap_(false) : undefined;
  return {
    ok: true,
    unchanged: false,
    rev: currentRev,
    pendingCount: files.length,
    recentUploads: recentUploads,
    pendingDeletesProcessed: pendingDeletesProcessed,
    inboxFolderId: primaryId,
    inboxFolderUrl: 'https://drive.google.com/drive/folders/' + primaryId,
    destRootFolderId: CATEGORIAS_DEST_ROOT_FOLDER_ID_,
    destRootFolderUrl: 'https://drive.google.com/drive/folders/' + CATEGORIAS_DEST_ROOT_FOLDER_ID_,
    destFolders: CATEGORIAS_DEST_FOLDERS_,
    hoja1SkusAdded: skuSync.added || 0,
    hoja1TotalSkus: skuSync.totalHoja1 || 0,
    files: files,
    loadedFileNames: loadedFileNames
  };
}

function handleFotosSyncSkus_(body) {
  const ss = getSpreadsheet_();
  const auth = verifyExclusiveKevinOwner_(ss, body);
  if (!auth.ok) return auth;

  ensureProjectAPublicFolders_(false);

  // Si se proporcionó un SKU puntual recién dado de alta en S Mueblería ERP (aún con 0 stock), consultarlo directo por WCF
  const querySku = String((body && body.querySku) || '').trim().toUpperCase();
  let directErpFound = null;
  if (querySku && querySku.length >= 3) {
    try {
      const wcfProd = buscarProductoPorClaveWcf_(querySku);
      if (wcfProd && wcfProd.IdProducto && String(wcfProd.Clave || '').trim().toUpperCase() === querySku) {
        directErpFound = wcfProd;
        const shPl = ss.getSheetByName('plantilla');
        if (shPl && shPl.getLastColumn() >= 34) {
          const aeVals = shPl.getRange(2, 31, Math.max(1, shPl.getLastRow() - 1), 1).getDisplayValues();
          let existsInPl = false;
          let lastAe = 1;
          for (let i = 0; i < aeVals.length; i++) {
            const cSk = String(aeVals[i][0] || '').trim().toUpperCase();
            if (cSk) {
              lastAe = i + 2;
              if (cSk === querySku) { existsInPl = true; break; }
            }
          }
          if (!existsInPl) {
            const nextAe = lastAe + 1;
            if (shPl.getMaxRows() < nextAe) shPl.insertRowsAfter(shPl.getMaxRows(), nextAe - shPl.getMaxRows());
            shPl.getRange(nextAe, 31, 1, 1).setNumberFormat('@');
            shPl.getRange(nextAe, 31, 1, 4).setValues([[
              querySku,
              String(wcfProd.IdProducto).trim(),
              cleanInvCell_(wcfProd.Nombre) || querySku,
              Number(wcfProd.Precio || 0) || ''
            ]]);
          }
        }
      }
    } catch (eDirectWcf) {}
  }

  let erpSyncRes = { ok: false, newSkusAdded: 0, hoja1SkusAdded: 0 };
  try {
    erpSyncRes = sincronizarInventarioEnVivoDesdeERP({ silentUi: true }) || erpSyncRes;
  } catch (eErp) {}

  const hoja1Res = sincronizarSkusHoja1DesdeInventario_(ss, true);
  const totalAddedHoja1 = ((erpSyncRes && erpSyncRes.hoja1SkusAdded) || 0) + ((hoja1Res && hoja1Res.added) || 0);

  if (totalAddedHoja1 > 0 || (erpSyncRes && erpSyncRes.newSkusAdded > 0)) {
    try {
      registrarEventoHistorial_(ss, {
        clasificacion: 'MOVIMIENTO',
        modulo: 'AppsScript · Gestor Fotos Hoja "1"',
        evento: 'SINCRONIZACIÓN DE SKUS EN HOJA "1"',
        estado: '✅ OK',
        usuario: 'Kevin Reyna (' + OWNER_FOTOS_EMAIL_ + ')',
        sucursal: 'ADMINISTRACIÓN GENERAL',
        referencia: '+' + totalAddedHoja1 + ' en Hoja "1"',
        detalle: 'SKUs sincronizados desde S Mueblería ERP / INVENTARIO_EN_VIVO hacia Hoja "1" (total: ' + (hoja1Res.totalHoja1 || 0) + ').',
        analisis: 'Fórmulas maestras B2:F2 y F2 intactas.'
      });
    } catch (eHist) {}
  }

  return {
    ok: true,
    erpSynced: !!(erpSyncRes && erpSyncRes.ok),
    invAdded: (erpSyncRes && erpSyncRes.newSkusAdded) || 0,
    hoja1Added: totalAddedHoja1,
    totalHoja1: (hoja1Res && hoja1Res.totalHoja1) || 0,
    directErpSku: directErpFound ? String(directErpFound.Clave || '').toUpperCase() : '',
    timestamp: formatCancunNow_()
  };
}

function handleFotosSubirUploadInbox_(body) {
  try {
    const auth = verifyExclusiveKevinOwner_(null, body);
    if (!auth.ok) return auth;
    const actorEmail = String((auth.advisor && auth.advisor.correo) || OWNER_FOTOS_EMAIL_).trim();

    const parsed = parseUploadFileDataUrl_(body && body.dataUrl, body && body.fileName, 'archivo-' + Date.now());
    if (!parsed.ok) return parsed;

    const lockState = acquireScriptLockSafe_(15000);
    if (!lockState.ok) {
      return {
        ok: false,
        retryable: true,
        error: 'Otro guardado está en curso, reintentando...'
      };
    }
    const lock = lockState.lock;
    let fid = '';
    let createdName = '';
    let sizeBytes = 0;
    let updatedIso = '';
    let nextRev = '';
    let recentUploads = [];
    try {
      ensureProjectAPublicFolders_(false);
      const resolved = resolveSubirInboxFolders_();
      const inbox = resolved.primaryFolder || DriveApp.getFolderById(SUBIR_INBOX_FOLDER_ID_);
      ensurePublicSharingItem_(inbox);
      const created = inbox.createFile(parsed.blob);
      ensurePublicSharingItem_(created);
      fid = created.getId();
      createdName = String(created.getName() || parsed.fileName).trim();
      sizeBytes = Number(created.getSize() || parsed.sizeBytes || 0) || 0;
      updatedIso = new Date().toISOString();
      nextRev = bumpFotosInboxRev_();
      recentUploads = recordFotosRecentUpload_({
        id: fid,
        fileId: fid,
        targetKey: 'INBOX',
        targetLabel: createdName,
        targetKind: parsed.kind === 'document' ? 'DOCUMENTO' : 'SUBIR_PREN',
        kind: parsed.kind,
        ext: parsed.ext,
        fileName: createdName,
        viewUrl: 'https://drive.google.com/file/d/' + fid + '/view?usp=sharing',
        downloadUrl: 'https://drive.google.com/uc?export=download&id=' + fid,
        thumbUrl: parsed.kind === 'image' ? ('https://lh3.googleusercontent.com/d/' + fid + '=w800') : '',
        destFolderName: 'SUBIR PREN',
        actorEmail: actorEmail,
        ts: Date.now()
      });
    } finally {
      try { lock.releaseLock(); } catch (eRel) {}
    }

    const isImg = (parsed.kind === 'image');
    return {
      ok: true,
      rev: nextRev,
      recentUploads: recentUploads,
      file: {
        id: fid,
        name: createdName,
        kind: parsed.kind,
        ext: parsed.ext,
        mimeType: parsed.mime,
        sizeBytes: sizeBytes,
        updatedAt: updatedIso,
        viewUrl: 'https://drive.google.com/file/d/' + fid + '/view?usp=sharing',
        downloadUrl: 'https://drive.google.com/uc?export=download&id=' + fid,
        thumbUrl: isImg ? ('https://lh3.googleusercontent.com/d/' + fid + '=w800') : ''
      },
      files: (body && body.skipListReturn) ? undefined : listSubirInboxFilesInternal_()
    };
  } catch (errUpInbox) {
    return {
      ok: false,
      error: (errUpInbox && errUpInbox.message) ? errUpInbox.message : String(errUpInbox)
    };
  }
}

function handleFotosSubirAssign_(body) {
  try {
    const ss = getSpreadsheet_();
    const auth = verifyExclusiveKevinOwner_(ss, body);
    if (!auth.ok) return auth;
    const actorEmail = String((auth.advisor && auth.advisor.correo) || OWNER_FOTOS_EMAIL_).trim();
    const actorName = String((auth.advisor && auth.advisor.nombre) || 'Kevin Reyna').trim();

    const skuUpper = String((body && body.sku) || '').trim().toUpperCase();
    const driveFileId = String((body && body.driveFileId) || '').trim();
    if (!skuUpper) {
      return { ok: false, error: 'Selecciona primero el SKU del producto.' };
    }
    if (!driveFileId) {
      return { ok: false, error: 'Selecciona primero una fotografía.' };
    }

    const sh1 = ss.getSheetByName('1');
    if (!sh1) {
      return { ok: false, error: 'No se encontró la hoja "1" en el documento maestro.' };
    }

    ensureProjectAPublicFolders_(false);

    const reqFolderId = String((body && body.targetFolderId) || '').trim();
    const reqDestMeta = reqFolderId
      ? (CATEGORIAS_DEST_FOLDERS_.find((f) => f.id === reqFolderId) || null)
      : null;
    if (reqFolderId && (isForbiddenProjectBFolderId_(reqFolderId) || !reqDestMeta)) {
      return {
        ok: false,
        forbiddenFolder: true,
        error: 'Carpeta destino inválida o fuera de CATEGORIAS MUEBLES Y ACCESORIOS.'
      };
    }

    const providedName = String((body && body.productName) || '').trim();
    const sheetInvMeta = lookupInvMetaFast_(ss, skuUpper);
    const invMeta = {
      nombre: sheetInvMeta.nombre || providedName,
      tipo: sheetInvMeta.tipo || String((body && body.tipo) || '').trim(),
      categoria: sheetInvMeta.categoria || String((body && body.categoria) || '').trim()
    };

    // Siempre acomodar automáticamente según la información de Sheets (a menos que se pida forceTargetFolderId explícito)
    const destMeta = (body && body.forceTargetFolderId && reqDestMeta)
      ? reqDestMeta
      : resolveCategoryDestFolderForProduct_(invMeta.categoria, invMeta.tipo, invMeta.nombre);
    const destFolder = DriveApp.getFolderById(destMeta.id);
    ensurePublicSharingItem_(destFolder);

    // Pre-lectura fuera del lock para saber si el archivo ya está en uso por otro SKU (copy vs move)
    let isUsedByOtherSku = false;
    let preSheetName = '';
    try {
      const preRows = Math.max(sh1.getLastRow(), 3);
      const preVals = sh1.getRange(1, 1, preRows, 4).getDisplayValues();
      for (let i = 2; i < preVals.length; i++) {
        const cellSku = String(preVals[i][0] || '').trim().toUpperCase();
        const cellUrl = String(preVals[i][3] || '').trim();
        if (cellSku === skuUpper && !preSheetName && preVals[i][1]) {
          preSheetName = String(preVals[i][1]).trim();
        } else if (cellSku && cellSku !== skuUpper && cellUrl && cellUrl.indexOf(driveFileId) !== -1) {
          isUsedByOtherSku = true;
        }
      }
    } catch (ePreScan) {}

    const effectiveName = preSheetName || invMeta.nombre || providedName || skuUpper;

    if (isForbiddenProjectBFolderId_(driveFileId)) {
      return {
        ok: false,
        forbiddenFolder: true,
        error: 'Aislamiento Proyecto A/B: no se permite mover ni asignar recursos de carpetas de Prompts/Odoo.'
      };
    }
    const srcFile = DriveApp.getFileById(driveFileId);
    const srcCheck = validateProjectASourceFile_(srcFile, 'fotos_subir_assign');
    if (!srcCheck.ok) {
      return srcCheck;
    }

    // Respetar siempre el nombre original de la foto tal como se cargó/colocó
    const origName = String(srcFile.getName() || '').trim();
    const mimeLower = String(srcFile.getMimeType() || '').toLowerCase();
    const fallbackExt = mimeLower.indexOf('png') !== -1 ? '.png' : (mimeLower.indexOf('webp') !== -1 ? '.webp' : '.jpg');
    const preservedFileName = origName || (skuUpper + fallbackExt);

    let file = srcFile;
    const reuseFromLoaded = isUsedByOtherSku || !!(body && body.fromLoaded);

    if (reuseFromLoaded) {
      try {
        file = srcFile.makeCopy(preservedFileName, destFolder);
      } catch (eCopyLoaded) {
        file = srcFile;
      }
    } else {
      file.moveTo(destFolder);
      cleanDuplicatesInSubirInbox_(file, preservedFileName, body && body.shortcutId, null);
    }

    ensurePublicSharingItem_(file);

    try {
      file.setDescription(
        'SKU: ' + skuUpper +
        ' | Producto: ' + effectiveName +
        ' | Categoría Drive: ' + destMeta.name +
        ' | Asignado por: ' + actorEmail +
        ' | Fecha: ' + formatCancunNow_()
      );
    } catch (eDesc) {}

    const finalFileId = file.getId();
    const finalFileName = String(file.getName() || preservedFileName).trim();
    const driveViewUrl = 'https://drive.google.com/file/d/' + finalFileId + '/view?usp=sharing';

    // Lock corto ÚNICAMENTE para escribir en Hoja "1" sin bloquear operaciones Drive concurrentes
    let primaryRowNumber = 0;
    let wasAppended = false;
    let previousUrl = '';
    let formulaResolvedName = effectiveName;
    const lockState = acquireScriptLockSafe_(15000);
    if (!lockState.ok) {
      return {
        ok: false,
        retryable: true,
        error: 'Otro guardado está en curso, reintentando...'
      };
    }
    const lock = lockState.lock;
    try {
      const maxScanRows = Math.max(sh1.getLastRow(), 3);
      const vals1 = sh1.getRange(1, 1, maxScanRows, 4).getDisplayValues();
      const matchedRows = [];
      let lastSkuRowInColA = 2; // Nunca escribir en fila 1 ni fila 2 (fórmulas maestras)
      for (let i = 2; i < vals1.length; i++) {
        const rowNum = i + 1;
        const cellSku = String(vals1[i][0] || '').trim().toUpperCase();
        const cellUrl = String(vals1[i][3] || '').trim();
        if (cellSku) {
          lastSkuRowInColA = rowNum;
          if (cellSku === skuUpper) {
            matchedRows.push(rowNum);
            if (!previousUrl && cellUrl) previousUrl = cellUrl;
          }
        }
      }

      if (matchedRows.length > 0) {
        primaryRowNumber = matchedRows[0];
        for (let m = 0; m < matchedRows.length; m++) {
          sh1.getRange(matchedRows[m], 4).setValue(driveViewUrl);
        }
      } else {
        wasAppended = true;
        primaryRowNumber = Math.max(3, lastSkuRowInColA + 1);
        if (primaryRowNumber > sh1.getMaxRows()) {
          sh1.insertRowAfter(sh1.getMaxRows());
        }
        const colACell = sh1.getRange(primaryRowNumber, 1);
        if (typeof colACell.setNumberFormat === 'function') colACell.setNumberFormat('@');
        colACell.setValue(skuUpper);
        sh1.getRange(primaryRowNumber, 4).setValue(driveViewUrl);
      }

      SpreadsheetApp.flush();
      invalidateLoadedFileNamesCache_();
      if (wasAppended) {
        try {
          const bVal = String(sh1.getRange(primaryRowNumber, 2).getDisplayValue() || '').trim();
          if (bVal) formulaResolvedName = bVal;
        } catch (eReadB) {}
      }
    } finally {
      try { lock.releaseLock(); } catch (e) {}
    }

    const nextRev = bumpFotosInboxRev_();
    const recentUploads = recordFotosRecentUpload_({
      id: finalFileId,
      fileId: finalFileId,
      targetKey: skuUpper,
      targetLabel: formulaResolvedName,
      targetKind: 'SKU',
      kind: 'image',
      ext: String(finalFileName.split('.').pop() || 'jpg').toLowerCase(),
      fileName: finalFileName,
      viewUrl: driveViewUrl,
      thumbUrl: 'https://lh3.googleusercontent.com/d/' + finalFileId + '=w800',
      destFolderName: destMeta.name,
      actorEmail: actorEmail,
      ts: Date.now()
    });

    try {
      registrarEventoHistorial_(ss, {
        clasificacion: 'MOVIMIENTO',
        modulo: 'AppsScript · Gestor Fotos Hoja "1"',
        evento: reuseFromLoaded
          ? 'FOTO TOMADA DE CARGADAS Y ASIGNADA EN HOJA "1"'
          : (wasAppended ? 'NUEVO SKU + FOTO ASIGNADA DESDE SUBIR PREN' : 'FOTO ACTUALIZADA EN HOJA "1" DESDE SUBIR PREN'),
        estado: '✅ OK',
        usuario: actorName + ' (' + actorEmail + ')',
        sucursal: 'ADMINISTRACIÓN GENERAL',
        referencia: skuUpper + ' · Fila ' + primaryRowNumber,
        detalle: (reuseFromLoaded ? 'Tomada de fotos cargadas hacia "' : 'Movida de SUBIR PREN a "') + destMeta.name + '" conservando nombre "' + finalFileName + '" · Guardada en Hoja "1"!D' + primaryRowNumber + ': ' + driveViewUrl,
        analisis: previousUrl ? ('Reemplazó link anterior: ' + previousUrl) : 'Producto previamente sin foto en Columna D.'
      });
    } catch (eHist) {}

    return {
      ok: true,
      rev: nextRev,
      recentUploads: recentUploads,
      sku: skuUpper,
      productName: formulaResolvedName,
      rowNumber: primaryRowNumber,
      wasAppended: wasAppended,
      reusedLoaded: reuseFromLoaded,
      previousUrl: previousUrl,
      newUrl: driveViewUrl,
      thumbUrl: 'https://lh3.googleusercontent.com/d/' + finalFileId + '=w900',
      fileId: finalFileId,
      fileName: finalFileName,
      destFolderKey: destMeta.key,
      destFolderId: destMeta.id,
      destFolderName: destMeta.name,
      destFolderUrl: 'https://drive.google.com/drive/folders/' + destMeta.id,
      remainingFiles: (body && body.skipListReturn) ? undefined : listSubirInboxFilesInternal_(),
      timestamp: formatCancunNow_()
    };
  } catch (errAssign) {
    try {
      registrarEventoHistorial_(getSpreadsheet_(), {
        clasificacion: 'FALLO DE CÓDIGO',
        modulo: 'AppsScript · handleFotosSubirAssign_',
        evento: 'ERROR AL ASIGNAR FOTO DESDE SUBIR A HOJA "1"',
        estado: '❌ ERROR',
        usuario: String((body && (body.advisorEmail || body.email)) || OWNER_FOTOS_EMAIL_),
        sucursal: 'ADMINISTRACIÓN GENERAL',
        referencia: String((body && body.sku) || ''),
        detalle: (errAssign && errAssign.message) ? errAssign.message : String(errAssign),
        analisis: analizarCausaFalloCodigo_(errAssign, 'AppsScript · handleFotosSubirAssign_', 'fotos_subir_assign')
      });
    } catch (eLogIgnore) {}
    return {
      ok: false,
      error: (errAssign && errAssign.message) ? errAssign.message : String(errAssign)
    };
  }
}

function handleFotosDirectUploadAssign_(body) {
  try {
    const ss = getSpreadsheet_();
    const auth = verifyExclusiveKevinOwner_(ss, body);
    if (!auth.ok) return auth;
    const actorEmail = String((auth.advisor && auth.advisor.correo) || OWNER_FOTOS_EMAIL_).trim();
    const actorName = String((auth.advisor && auth.advisor.nombre) || 'Kevin Reyna').trim();

    const skuUpper = String((body && body.sku) || '').trim().toUpperCase();
    if (!skuUpper) {
      return { ok: false, error: 'Selecciona primero el SKU del producto.' };
    }
    const parsed = parseUploadImageDataUrl_(body && body.dataUrl, body && body.fileName, skuUpper);
    if (!parsed.ok) return parsed;

    const sh1 = ss.getSheetByName('1');
    if (!sh1) {
      return { ok: false, error: 'No se encontró la hoja "1" en el documento maestro.' };
    }

    ensureProjectAPublicFolders_(false);

    // Acomodar siempre automáticamente según Sheets (INVENTARIO_EN_VIVO)
    const sheetInvMeta = lookupInvMetaFast_(ss, skuUpper);
    const invMeta = {
      nombre: sheetInvMeta.nombre || String((body && body.productName) || '').trim() || skuUpper,
      tipo: sheetInvMeta.tipo || String((body && body.tipo) || '').trim(),
      categoria: sheetInvMeta.categoria || String((body && body.categoria) || '').trim()
    };
    const destMeta = resolveCategoryDestFolderForProduct_(invMeta.categoria, invMeta.tipo, invMeta.nombre);
    const destFolder = DriveApp.getFolderById(destMeta.id);
    ensurePublicSharingItem_(destFolder);

    // Adquirir ScriptLock ANTES de crear archivo en Drive para que ningún reintento genere duplicados en Drive
    const lockState = acquireScriptLockSafe_(15000);
    if (!lockState.ok) {
      return {
        ok: false,
        retryable: true,
        error: 'Otro guardado está en curso, reintentando...'
      };
    }
    const lock = lockState.lock;
    let finalFileId = '';
    let finalFileName = '';
    let driveViewUrl = '';
    let previousUrl = '';
    let primaryRowNumber = 0;
    let wasAppended = false;
    let nextRev = '';
    let recentUploads = [];
    try {
      const created = destFolder.createFile(parsed.blob);
      ensurePublicSharingItem_(created);
      try {
        created.setDescription(
          'SKU: ' + skuUpper +
          ' | Producto: ' + invMeta.nombre +
          ' | Categoría Drive: ' + destMeta.name +
          ' | Subido directo por: ' + actorEmail +
          ' | Fecha: ' + formatCancunNow_()
        );
      } catch (eDesc) {}

      finalFileId = created.getId();
      finalFileName = String(created.getName() || parsed.fileName).trim();
      driveViewUrl = 'https://drive.google.com/file/d/' + finalFileId + '/view?usp=sharing';

      const matchedRows = [];
      const lastRow1 = Math.max(2, sh1.getLastRow());
      const colARng = lastRow1 >= 3 ? sh1.getRange(3, 1, lastRow1 - 2, 1) : null;

      if (colARng && typeof colARng.createTextFinder === 'function') {
        const hits = colARng.createTextFinder(skuUpper).matchEntireCell(true).matchCase(false).findAll();
        for (let h = 0; h < hits.length; h++) {
          const rNum = hits[h].getRow();
          if (rNum >= 3) {
            matchedRows.push(rNum);
            if (!previousUrl) previousUrl = String(sh1.getRange(rNum, 4).getDisplayValue() || '').trim();
          }
        }
      } else if (lastRow1 >= 3) {
        const vals1 = sh1.getRange(3, 1, lastRow1 - 2, 4).getValues();
        for (let i = 0; i < vals1.length; i++) {
          if (String(vals1[i][0] || '').trim().toUpperCase() === skuUpper) {
            matchedRows.push(i + 3);
            if (!previousUrl && vals1[i][3]) previousUrl = String(vals1[i][3]).trim();
          }
        }
      }

      if (matchedRows.length > 0) {
        primaryRowNumber = matchedRows[0];
        for (let m = 0; m < matchedRows.length; m++) {
          sh1.getRange(matchedRows[m], 4).setValue(driveViewUrl);
        }
      } else {
        wasAppended = true;
        let lastNonEmptyA = 2;
        if (lastRow1 >= 3) {
          const colAVals = sh1.getRange(3, 1, lastRow1 - 2, 1).getValues();
          for (let k = colAVals.length - 1; k >= 0; k--) {
            if (String(colAVals[k][0] || '').trim()) {
              lastNonEmptyA = k + 3;
              break;
            }
          }
        }
        primaryRowNumber = Math.max(3, lastNonEmptyA + 1);
        if (primaryRowNumber > sh1.getMaxRows()) sh1.insertRowAfter(sh1.getMaxRows());
        const colACell = sh1.getRange(primaryRowNumber, 1);
        if (typeof colACell.setNumberFormat === 'function') colACell.setNumberFormat('@');
        colACell.setValue(skuUpper);
        sh1.getRange(primaryRowNumber, 4).setValue(driveViewUrl);
      }

      SpreadsheetApp.flush();
      invalidateLoadedFileNamesCache_();
      nextRev = bumpFotosInboxRev_();
      recentUploads = recordFotosRecentUpload_({
        id: finalFileId,
        fileId: finalFileId,
        targetKey: skuUpper,
        targetLabel: invMeta.nombre,
        targetKind: 'SKU',
        kind: 'image',
        ext: parsed.ext || 'jpg',
        fileName: finalFileName,
        viewUrl: driveViewUrl,
        thumbUrl: 'https://lh3.googleusercontent.com/d/' + finalFileId + '=w800',
        destFolderName: destMeta.name,
        actorEmail: actorEmail,
        ts: Date.now()
      });
    } finally {
      try { lock.releaseLock(); } catch (e) {}
    }

    try {
      registrarEventoHistorial_(ss, {
        clasificacion: 'MOVIMIENTO',
        modulo: 'AppsScript · Gestor Fotos Hoja "1"',
        evento: 'SUBIDA DIRECTA RÁPIDA EN HOJA "1"',
        estado: '✅ OK',
        usuario: actorName + ' (' + actorEmail + ')',
        sucursal: 'ADMINISTRACIÓN GENERAL',
        referencia: skuUpper + ' · Fila ' + primaryRowNumber,
        detalle: 'Subida directa a "' + destMeta.name + '" conservando nombre "' + finalFileName + '" · Hoja "1"!D' + primaryRowNumber + ': ' + driveViewUrl,
        analisis: previousUrl ? ('Reemplazó link anterior: ' + previousUrl) : 'Producto previamente sin foto.'
      });
    } catch (eHist) {}

    return {
      ok: true,
      rev: nextRev,
      recentUploads: recentUploads,
      sku: skuUpper,
      productName: invMeta.nombre,
      rowNumber: primaryRowNumber,
      wasAppended: wasAppended,
      previousUrl: previousUrl,
      newUrl: driveViewUrl,
      thumbUrl: 'https://lh3.googleusercontent.com/d/' + finalFileId + '=w900',
      fileId: finalFileId,
      fileName: finalFileName,
      destFolderKey: destMeta.key,
      destFolderId: destMeta.id,
      destFolderName: destMeta.name,
      destFolderUrl: 'https://drive.google.com/drive/folders/' + destMeta.id,
      timestamp: formatCancunNow_()
    };
  } catch (errDirect) {
    return {
      ok: false,
      error: (errDirect && errDirect.message) ? errDirect.message : String(errDirect)
    };
  }
}

function handleFotosUploadVisualOverride_(body) {
  try {
    const b = body || {};
    const ss = getSpreadsheet_();
    const auth = verifyExclusiveKevinOwner_(ss, b);
    if (!auth.ok) return auth;
    if (auth.advisor && auth.advisor.adminPermissions && auth.advisor.adminPermissions.gestionProductos === false) {
      return {
        ok: false,
        forbidden: true,
        error: 'Tu cuenta tiene desactivado VER_GESTION_PRODUCTOS en CUENTAS ADMINISTRATIVAS.'
      };
    }
    const actorEmail = String((auth.advisor && auth.advisor.correo) || OWNER_FOTOS_EMAIL_).trim();

    const ovKey = String(b.overrideKey || b.sku || '').trim().toUpperCase();
    if (!ovKey || !/^V(?:COV|FAB|WOD):/i.test(ovKey) || ovKey.length > 80) {
      return { ok: false, error: 'Clave de portada/tela/madera inválida.' };
    }
    const kind = String(b.kind || (ovKey.indexOf('VFAB:') === 0 ? 'fabric' : (ovKey.indexOf('VWOD:') === 0 ? 'wood' : 'cover'))).trim().toLowerCase();
    const label = String(b.label || b.name || ovKey).trim().slice(0, 140);
    const categoryTag = kind === 'fabric' ? 'FABRIC_SWATCH' : (kind === 'wood' ? 'WOOD_SWATCH' : 'VISUAL_COVER');

    const sourceInboxFileId = String(b.sourceInboxFileId || '').trim();
    const fromLoaded = !!b.fromLoaded;
    let parsedUpload = null;
    if (sourceInboxFileId) {
      if (isForbiddenProjectBFolderId_(sourceInboxFileId)) {
        return { ok: false, forbiddenFolder: true, error: 'Aislamiento Proyecto A/B: carpeta no permitida.' };
      }
    } else {
      parsedUpload = parseUploadImageDataUrl_(b.dataUrl, b.fileName, label.replace(/[^a-zA-Z0-9_-]+/g, '_'));
      if (!parsedUpload.ok) return parsedUpload;
    }

    ensureProjectAPublicFolders_(false);
    const targetFolder = DriveApp.getFolderById(FOTOS_NUEVAS_CARGADO_FOLDER_ID_);
    ensurePublicSharingItem_(targetFolder);

    let finalFileId = '';
    let finalFileName = '';
    let createdUploadFile = null;

    if (!sourceInboxFileId) {
      // P1-01: subir binario a Drive FUERA del ScriptLock global para evitar contención;
      // si el candado de Sheets está ocupado, se revierte a papelera para que reintentos jamás dupliquen archivos.
      createdUploadFile = targetFolder.createFile(parsedUpload.blob);
      ensurePublicSharingItem_(createdUploadFile);
      try {
        createdUploadFile.setDescription(
          'Visual: ' + ovKey +
          ' | Etiqueta: ' + label +
          ' | Tipo: ' + categoryTag +
          ' | Subido por: ' + actorEmail +
          ' | Fecha: ' + formatCancunNow_()
        );
      } catch (eDesc) {}
      finalFileId = createdUploadFile.getId();
      finalFileName = String(createdUploadFile.getName() || parsedUpload.fileName).trim();
    }

    const lockState = acquireScriptLockSafe_(15000);
    if (!lockState.ok) {
      if (createdUploadFile) {
        try { createdUploadFile.setTrashed(true); } catch (eRollback) {}
      }
      return {
        ok: false,
        retryable: true,
        error: 'Otro guardado está en curso, reintentando...'
      };
    }
    const lock = lockState.lock;
    try {
      if (sourceInboxFileId) {
        const srcFile = DriveApp.getFileById(sourceInboxFileId);
        const srcCheck = validateProjectASourceFile_(srcFile, 'fotos_upload_visual_override');
        if (!srcCheck.ok) return srcCheck;
        finalFileName = String(srcFile.getName() || '').trim();
        if (!fromLoaded) {
          // Mover desde SUBIR PREN a FOTOS NUEVAS CARGADO conservando su nombre y sacándola de SUBIR PREN para no duplicar
          srcFile.moveTo(targetFolder);
          cleanDuplicatesInSubirInbox_(srcFile, finalFileName, b.shortcutId, null);
        }
        ensurePublicSharingItem_(srcFile);
        finalFileId = srcFile.getId();
      }

      const driveViewUrl = 'https://drive.google.com/file/d/' + finalFileId + '/view?usp=sharing';
      const saveRes = handleInvProductOverrideSave_({
        authToken: b.authToken || '',
        advisorEmail: b.advisorEmail || actorEmail,
        accessKey: b.accessKey || '',
        sheetTab: b.sheetTab || TAB_CUENTAS_ADMIN_,
        sku: ovKey,
        op: 'RESTORE',
        name: label,
        category: categoryTag,
        price: '',
        note: driveViewUrl
      }, { skipLock: true });
      invalidateLoadedFileNamesCache_();

      if (!saveRes || !saveRes.ok) {
        return {
          ok: false,
          fileId: finalFileId,
          driveUrl: driveViewUrl,
          error: (saveRes && saveRes.error) || 'Foto subida, pero falló guardar el vínculo.'
        };
      }

      const nextRev = bumpFotosInboxRev_();
      const recentUploads = recordFotosRecentUpload_({
        id: finalFileId,
        fileId: finalFileId,
        targetKey: ovKey,
        targetLabel: label,
        targetKind: kind === 'fabric' ? 'TELA' : (kind === 'wood' ? 'MADERA' : 'PORTADA'),
        kind: 'image',
        ext: (parsedUpload && parsedUpload.ext) || String(finalFileName.split('.').pop() || 'jpg').toLowerCase(),
        fileName: finalFileName,
        viewUrl: driveViewUrl,
        thumbUrl: 'https://lh3.googleusercontent.com/d/' + finalFileId + '=w800',
        destFolderName: kind === 'fabric' ? 'Tela' : (kind === 'wood' ? 'Madera' : 'Portada'),
        actorEmail: actorEmail,
        ts: Date.now()
      });

      return {
        ok: true,
        rev: nextRev,
        recentUploads: recentUploads,
        overrideKey: ovKey,
        fileId: finalFileId,
        fileName: finalFileName,
        driveUrl: driveViewUrl,
        thumbUrl: 'https://lh3.googleusercontent.com/d/' + finalFileId + '=w800',
        override: saveRes.override,
        removedFromInbox: !!(sourceInboxFileId && !fromLoaded),
        timestamp: formatCancunNow_()
      };
    } finally {
      try { lock.releaseLock(); } catch (eRel) {}
    }
  } catch (errVisUp) {
    return {
      ok: false,
      error: (errVisUp && errVisUp.message) ? errVisUp.message : String(errVisUp)
    };
  }
}

function reubicarFotosSegunSheets_(opts) {
  const cfg = opts || {};
  const startMs = Date.now();
  const timeBudgetMs = Math.max(15000, Math.min(240000, Number(cfg.timeBudgetMs) || 45000));
  const startIndex = Math.max(0, parseInt(String(cfg.startIndex || 0), 10) || 0);
  const maxFiles = Math.max(1, Math.min(600, parseInt(String(cfg.maxFiles || 120), 10) || 120));

  const summary = {
    ok: true,
    foldersPublicUpdated: 0,
    filesChecked: 0,
    filesMoved: 0,
    filesMadePublic: 0,
    subirDuplicatesRemoved: 0,
    visualOverridesPublic: 0,
    nextStartIndex: 0,
    remaining: 0,
    errors: []
  };

  if (startIndex === 0) {
    const pubRes = ensureProjectAPublicFolders_(true);
    summary.foldersPublicUpdated = (pubRes && pubRes.updated) || 0;
  }

  const ss = getSpreadsheet_();
  const shInv = ss.getSheetByName(CONFIG.TAB_INVENTORY || 'INVENTARIO_EN_VIVO');
  const sh1 = ss.getSheetByName('1');
  const invBySku = {};

  if (shInv && shInv.getLastRow() >= 3) {
    const invVals = shInv.getRange(3, 1, shInv.getLastRow() - 2, 7).getValues();
    for (let i = 0; i < invVals.length; i++) {
      const sk = cleanInvCell_(invVals[i][0]).toUpperCase();
      if (!sk || sk === 'SKU') continue;
      invBySku[sk] = {
        tipo: cleanInvCell_(invVals[i][1]),
        nombre: cleanInvCell_(invVals[i][3]),
        categoria: cleanInvCell_(invVals[i][6]),
        photoUrl: String(invVals[i][5] || '').trim()
      };
    }
  }

  // Agrupar por fileId -> categorías destino según Sheets
  const fileEntriesById = {};
  const orderedIds = [];
  const registerSkuFile = (skuUpper, rawUrl, colBName) => {
    const fid = extractDriveFileIdFromCell_(rawUrl);
    if (!fid || isForbiddenProjectBFolderId_(fid)) return;
    const inv = invBySku[skuUpper] || {};
    const dest = resolveCategoryDestFolderForProduct_(inv.categoria || '', inv.tipo || '', inv.nombre || colBName || skuUpper);
    if (!fileEntriesById[fid]) {
      fileEntriesById[fid] = { id: fid, destIds: {}, primaryDest: dest, isVisual: false };
      orderedIds.push(fid);
    }
    fileEntriesById[fid].destIds[dest.id] = dest;
  };

  // Priorizar primero Portadas (VCOV:) y Telas (VFAB:) guardadas en _INV_PRODUCT_OVERRIDES
  // para que siempre queden reparadas en el primer lote sin quedar detrás de miles de SKUs.
  try {
    const ovMap = readProductOverridesMap_(ss);
    Object.keys(ovMap).forEach((k) => {
      const entry = ovMap[k];
      if (!entry || entry.status === 'ELIMINADO' || entry.status === 'ARCHIVADO') return;
      const fid = extractDriveFileIdFromCell_(entry.note);
      if (!fid || isForbiddenProjectBFolderId_(fid) || fileEntriesById[fid]) return;
      fileEntriesById[fid] = {
        id: fid,
        destIds: {},
        primaryDest: { id: FOTOS_NUEVAS_CARGADO_FOLDER_ID_, name: 'FOTOS NUEVAS CARGADO' },
        isVisual: true
      };
      orderedIds.push(fid);
    });
  } catch (eOv) {}

  if (sh1 && sh1.getLastRow() >= 3 && sh1.getLastColumn() >= 4) {
    const vals1 = sh1.getRange(3, 1, sh1.getLastRow() - 2, 4).getDisplayValues();
    for (let i = 0; i < vals1.length; i++) {
      const sk = String(vals1[i][0] || '').trim().toUpperCase();
      const colB = String(vals1[i][1] || '').trim();
      const colD = String(vals1[i][3] || '').trim();
      if (sk && colD) registerSkuFile(sk, colD, colB);
    }
  }

  Object.keys(invBySku).forEach((sk) => {
    if (invBySku[sk].photoUrl) registerSkuFile(sk, invBySku[sk].photoUrl, invBySku[sk].nombre);
  });

  const resolvedInbox = resolveSubirInboxFolders_();
  const inboxMap = Object.assign({}, resolvedInbox.folderIdsMap || {});
  inboxMap[SUBIR_INBOX_FOLDER_ID_] = true;
  const folderObjCache = {};
  const getFolderCached = (fid) => {
    if (!folderObjCache[fid]) {
      folderObjCache[fid] = DriveApp.getFolderById(fid);
      ensurePublicSharingItem_(folderObjCache[fid]);
    }
    return folderObjCache[fid];
  };

  const endIndex = Math.min(orderedIds.length, startIndex + maxFiles);
  let idx = startIndex;
  for (; idx < endIndex; idx++) {
    if ((Date.now() - startMs) >= timeBudgetMs) break;
    const rec = fileEntriesById[orderedIds[idx]];
    if (!rec) continue;
    summary.filesChecked++;
    try {
      const file = DriveApp.getFileById(rec.id);
      if (!file || (file.isTrashed && file.isTrashed())) continue;
      if (isFileInForbiddenProjectBFolder_(file)) continue;

      const shareRes = ensurePublicSharingWithStatus_(file);
      if (shareRes && shareRes.changed) {
        summary.filesMadePublic++;
        if (rec.isVisual) summary.visualOverridesPublic++;
      }

      if (!isFileInProjectAAllowedFolders_(file, inboxMap)) continue;

      const parentIds = [];
      const pIt = file.getParents();
      while (pIt.hasNext()) {
        const pf = pIt.next();
        if (pf) parentIds.push(String(pf.getId() || '').trim());
      }

      const distinctDestIds = Object.keys(rec.destIds);
      const targetDestId = rec.primaryDest && rec.primaryDest.id;
      const isInSubir = parentIds.some((pid) => !!inboxMap[pid]);
      const isAlreadyInTarget = targetDestId && parentIds.indexOf(targetDestId) !== -1;

      if (rec.isVisual) {
        if (isInSubir && targetDestId) {
          const destFld = getFolderCached(targetDestId);
          file.moveTo(destFld);
          summary.filesMoved++;
          summary.subirDuplicatesRemoved += cleanDuplicatesInSubirInbox_(file, file.getName(), '', resolvedInbox);
        }
      } else if (targetDestId && distinctDestIds.length === 1 && (!isAlreadyInTarget || isInSubir)) {
        // Reubicar sin renombrar hacia la carpeta exacta de su categoría en Sheets
        const destFld = getFolderCached(targetDestId);
        file.moveTo(destFld);
        summary.filesMoved++;
        if (isInSubir) {
          summary.subirDuplicatesRemoved += cleanDuplicatesInSubirInbox_(file, file.getName(), '', resolvedInbox);
        }
      } else if (isInSubir && targetDestId) {
        // Si estaba compartida entre varias categorías pero aún seguía en SUBIR PREN, sacarla de SUBIR PREN
        const destFld = getFolderCached(targetDestId);
        if (!isAlreadyInTarget) {
          file.moveTo(destFld);
          summary.filesMoved++;
        }
        summary.subirDuplicatesRemoved += cleanDuplicatesInSubirInbox_(file, file.getName(), '', resolvedInbox);
      }
    } catch (eOne) {
      if (summary.errors.length < 25) {
        summary.errors.push(rec.id + ': ' + String((eOne && eOne.message) || eOne));
      }
    }
  }

  if (summary.filesMoved > 0 || summary.subirDuplicatesRemoved > 0) {
    invalidateLoadedFileNamesCache_();
    bumpFotosInboxRev_();
  }
  summary.nextStartIndex = idx < orderedIds.length ? idx : 0;
  summary.remaining = Math.max(0, orderedIds.length - idx);
  summary.checked = summary.filesChecked;
  summary.moved = summary.filesMoved;
  summary.publicFixed = summary.filesMadePublic + summary.foldersPublicUpdated;
  summary.nextIndex = summary.nextStartIndex;
  return summary;
}

function reubicarFotosSegunSheets() {
  const res = reubicarFotosSegunSheets_({ maxFiles: 500, timeBudgetMs: 240000 });
  Logger.log(JSON.stringify(res));
  return res;
}

function handleFotosReorganizeFromSheets_(body) {
  const ss = getSpreadsheet_();
  const auth = verifyExclusiveKevinOwner_(ss, body);
  if (!auth.ok) return auth;
  return reubicarFotosSegunSheets_({
    startIndex: body && body.startIndex,
    maxFiles: (body && (body.maxFiles || body.maxItems)) || 120,
    timeBudgetMs: 20000
  });
}

function handleFotosDelete_(body) {
  let deleteResult = null;
  try {
    const ss = getSpreadsheet_();
    const auth = verifyExclusiveKevinOwner_(ss, body);
    if (!auth.ok) return auth;
    const actorEmail = String((auth.advisor && auth.advisor.correo) || OWNER_FOTOS_EMAIL_).trim();
    const actorName = String((auth.advisor && auth.advisor.nombre) || 'Kevin Reyna').trim();

    const skuUpper = String((body && body.sku) || '').trim().toUpperCase();
    let driveFileId = String((body && body.driveFileId) || '').trim();
    const source = String((body && body.source) || '').trim().toUpperCase();
    const keepDriveFile = !!(body && body.keepDriveFile);
    const forceTrash = !!(body && body.forceTrash);

    if (!skuUpper && !driveFileId) {
      return { ok: false, error: 'Falta indicar SKU o ID de archivo a borrar.' };
    }

    const sh1 = ss.getSheetByName('1');
    const rowsToClear = [];
    const clearedRows = [];
    let previousUrl = '';
    let usedByOtherSku = false;
    let usedByVisualOverride = false;

    // Lectura preliminar fuera de ScriptLock para resolver driveFileId y protecciones
    if (sh1 && sh1.getLastRow() >= 3) {
      const maxScanRows = Math.max(sh1.getLastRow(), 3);
      const vals1 = sh1.getRange(1, 1, maxScanRows, 4).getDisplayValues();

      if (skuUpper) {
        for (let i = 2; i < vals1.length; i++) {
          const rowNum = i + 1;
          const cellSku = String(vals1[i][0] || '').trim().toUpperCase();
          const cellUrl = String(vals1[i][3] || '').trim();
          if (cellSku === skuUpper && cellUrl) {
            if (!previousUrl) previousUrl = cellUrl;
            if (!driveFileId) {
              const mId = cellUrl.match(/\/d\/([a-zA-Z0-9_-]{15,})/) || cellUrl.match(/[?&]id=([a-zA-Z0-9_-]{15,})/);
              if (mId && mId[1]) driveFileId = mId[1];
            }
            rowsToClear.push(rowNum);
          }
        }
      }

      if (driveFileId) {
        for (let j = 2; j < vals1.length; j++) {
          const otherSku = String(vals1[j][0] || '').trim().toUpperCase();
          const otherUrl = String(vals1[j][3] || '').trim();
          if (otherUrl && otherUrl.indexOf(driveFileId) !== -1 && (!skuUpper || otherSku !== skuUpper)) {
            usedByOtherSku = true;
            break;
          }
        }
      }
    }

    // Proteger archivos que también están referenciados por Portadas (VCOV:) o Telas (VFAB:) activas en _INV_PRODUCT_OVERRIDES
    if (driveFileId) {
      try {
        const ovMap = readProductOverridesMap_(ss);
        const ovKeys = Object.keys(ovMap);
        for (let oi = 0; oi < ovKeys.length; oi++) {
          const ov = ovMap[ovKeys[oi]];
          if (!ov || ov.status === 'ELIMINADO' || ov.status === 'ARCHIVADO') continue;
          const ovNote = String(ov.note || '');
          if (ovNote && ovNote.indexOf(driveFileId) !== -1) {
            usedByVisualOverride = true;
            break;
          }
        }
      } catch (eOvCheck) {}
    }

    // Guardia de aislamiento Proyecto A/B ANTES de modificar Drive o Hoja "1" (incluso si otro SKU comparte el archivo o keepDriveFile: true)
    const shortcutId = String((body && body.shortcutId) || '').trim();
    const deleteTargetId = (source === 'INBOX' && shortcutId) ? shortcutId : driveFileId;
    const willTrashDrive = !!(deleteTargetId && !keepDriveFile && !usedByVisualOverride && (source === 'INBOX' || forceTrash || !usedByOtherSku));
    let targetFile = null;
    if (deleteTargetId) {
      if (isForbiddenProjectBFolderId_(deleteTargetId)) {
        return {
          ok: false,
          forbiddenFolder: true,
          error: 'Aislamiento Proyecto A/B: no se permite eliminar recursos pertenecientes a carpetas exclusivas de Prompts/Odoo.'
        };
      }
      try {
        targetFile = DriveApp.getFileById(deleteTargetId);
      } catch (eLookupDel) {
        targetFile = null;
      }
      if (targetFile) {
        const delCheck = validateProjectASourceFile_(targetFile, 'fotos_delete');
        if (!delCheck.ok) {
          return delCheck;
        }
      }
    }

    // Adquirir ScriptLock corto ÚNICAMENTE para limpiar Columna D en Hoja "1"
    if (sh1 && skuUpper && rowsToClear.length > 0) {
      const lockState = acquireScriptLockSafe_(15000);
      if (!lockState.ok) {
        return {
          ok: false,
          retryable: true,
          error: 'Otro guardado está en curso, reintentando...'
        };
      }
      const lock = lockState.lock;
      try {
        const curLast = Math.max(sh1.getLastRow(), 3);
        const curVals = sh1.getRange(1, 1, curLast, 4).getDisplayValues();
        for (let i = 2; i < curVals.length; i++) {
          const rowNum = i + 1;
          const cellSku = String(curVals[i][0] || '').trim().toUpperCase();
          const cellUrl = String(curVals[i][3] || '').trim();
          if (cellSku === skuUpper && cellUrl) {
            sh1.getRange(rowNum, 4).clearContent();
            clearedRows.push(rowNum);
          }
        }
        if (clearedRows.length > 0) SpreadsheetApp.flush();
      } finally {
        try { lock.releaseLock(); } catch (e) {}
      }
    }

    let driveTrashed = false;
    let deletedFileName = '';
    if (willTrashDrive && targetFile) {
      try {
        deletedFileName = String(targetFile.getName() || '');
        try {
          targetFile.setTrashed(true);
          driveTrashed = true;
        } catch (eTrash) {
          // Si el archivo pertenece a otro propietario en carpeta compartida, quitarlo solo de carpetas permitidas
          const pIt = targetFile.getParents();
          while (pIt.hasNext()) {
            try {
              const pf = pIt.next();
              if (!isForbiddenProjectBFolderId_(pf.getId()) && !isFolderOrAncestorForbiddenProjectB_(pf, 8)) {
                pf.removeFile(targetFile);
                driveTrashed = true;
              }
            } catch (eRemP) {}
          }
        }
      } catch (eGetFile) {}
    }

    try { invalidateLoadedFileNamesCache_(); } catch (eInvCacheDel) {}
    const nextRev = bumpFotosInboxRev_();
    const recentUploads = removeFotosRecentUploadByFileId_(driveFileId);

    try {
      registrarEventoHistorial_(ss, {
        clasificacion: 'MOVIMIENTO',
        modulo: 'AppsScript · Gestor Fotos Hoja "1"',
        evento: skuUpper ? 'FOTO BORRADA DE HOJA "1" (COLUMNA D)' : 'FOTO BORRADA DE SUBIR PREN',
        estado: '✅ OK',
        usuario: actorName + ' (' + actorEmail + ')',
        sucursal: 'ADMINISTRACIÓN GENERAL',
        referencia: skuUpper ? (skuUpper + (clearedRows.length ? (' · Fila ' + clearedRows.join(',')) : '')) : (deletedFileName || driveFileId),
        detalle: (skuUpper ? ('Limpiada Columna D en Hoja "1" para SKU ' + skuUpper + (previousUrl ? (' (' + previousUrl + ')') : '')) : ('Eliminado archivo Drive ' + (deletedFileName || driveFileId))) + (driveTrashed ? ' · Archivo enviado a papelera Drive.' : (usedByVisualOverride ? ' · Archivo conservado en Drive (usado por Portada/Tela).' : '')),
        analisis: 'Fórmulas maestras B2:F2 intactas.'
      });
    } catch (eHistDel) {}

    deleteResult = {
      ok: true,
      rev: nextRev,
      recentUploads: recentUploads,
      clearedSku: skuUpper,
      clearedRows: clearedRows,
      deletedFileId: driveFileId,
      deletedFileName: deletedFileName,
      driveTrashed: driveTrashed,
      usedByOtherSku: usedByOtherSku,
      usedByVisualOverride: usedByVisualOverride,
      remainingFiles: (body && body.skipListReturn) ? [] : listSubirInboxFilesInternal_(),
      timestamp: formatCancunNow_()
    };
    return deleteResult;
  } catch (errDel) {
    return {
      ok: false,
      error: (errDel && errDel.message) ? errDel.message : String(errDel)
    };
  }
}
