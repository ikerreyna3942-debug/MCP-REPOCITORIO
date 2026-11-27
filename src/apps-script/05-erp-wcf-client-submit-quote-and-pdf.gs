// ----------------------------------------------------------------------------
// CLIENTE DIRECTO S MUEBLERÍA ERP (WCF SOAP 1.2) — 100% EN VIVO EN LA NUBE
// Sin secretos en código: lee configuración privada desde ScriptProperties / Drive
// ----------------------------------------------------------------------------
function xmlEscape_(str) {
  return String(str === null || str === undefined ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function decodeXmlEntities_(str) {
  return String(str || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function extractXmlTag_(block, tagName) {
  const re = new RegExp('<(?:[a-zA-Z0-9_]+:)?' + tagName + '(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[a-zA-Z0-9_]+:)?' + tagName + '>');
  const m = String(block || '').match(re);
  return m ? decodeXmlEntities_(m[1]).trim() : '';
}

function parseDotEnvText_(txt) {
  const out = {};
  const lines = String(txt || '').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i].trim();
    if (!ln || ln.charAt(0) === '#') continue;
    const eq = ln.indexOf('=');
    if (eq <= 0) continue;
    const k = ln.slice(0, eq).trim();
    let v = ln.slice(eq + 1).trim();
    if ((v.charAt(0) === '"' && v.slice(-1) === '"') || (v.charAt(0) === "'" && v.slice(-1) === "'")) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

function findPresentacionDisenoDriveFolder_() {
  const props = PropertiesService.getScriptProperties();
  const cachedFolderId = (props.getProperty('ERP_DRIVE_FOLDER_ID') || '').trim();
  if (cachedFolderId) {
    try {
      return DriveApp.getFolderById(cachedFolderId);
    } catch (e) {}
  }
  const it = DriveApp.getFoldersByName(ERP_DRIVE_FOLDER_NAME_);
  if (it.hasNext()) {
    const f = it.next();
    props.setProperty('ERP_DRIVE_FOLDER_ID', f.getId());
    return f;
  }
  return null;
}

function getErpRuntimeConfig_() {
  const props = PropertiesService.getScriptProperties();
  let user = (props.getProperty('ERP_USER') || '').trim();
  let pass = (props.getProperty('ERP_PASS') || '').trim();
  let loginUrl = (props.getProperty('ERP_LOGIN_URL') || '').trim();
  let wcfUrl = (props.getProperty('ERP_WCF_URL') || '').trim();
  let masterId = (props.getProperty('ERP_ID_USUARIO_MAESTRO') || '').trim();
  let lpptId = (props.getProperty('LPPT_PROVEDORES_SPREADSHEET_ID') || '').trim();

  if (!user || !pass) {
    try {
      const folder = findPresentacionDisenoDriveFolder_();
      if (folder) {
        const fIt = folder.getFilesByName('.env');
        if (fIt.hasNext()) {
          const envMap = parseDotEnvText_(fIt.next().getBlob().getDataAsString('UTF-8'));
          user = user || envMap.ERP_USER || '';
          pass = pass || envMap.ERP_PASS || '';
          loginUrl = loginUrl || envMap.ERP_LOGIN_URL || '';
          wcfUrl = wcfUrl || envMap.ERP_WCF_URL || '';
          masterId = masterId || envMap.ERP_ID_USUARIO_MAESTRO || '';
          lpptId = lpptId || envMap.LPPT_PROVEDORES_SPREADSHEET_ID || '';
          const toSave = {};
          if (user) toSave.ERP_USER = user;
          if (pass) toSave.ERP_PASS = pass;
          if (loginUrl) toSave.ERP_LOGIN_URL = loginUrl;
          if (wcfUrl) toSave.ERP_WCF_URL = wcfUrl;
          if (masterId) toSave.ERP_ID_USUARIO_MAESTRO = masterId;
          if (lpptId) toSave.LPPT_PROVEDORES_SPREADSHEET_ID = lpptId;
          if (Object.keys(toSave).length > 0) props.setProperties(toSave);
        }
      }
    } catch (e) {}
  }

  return {
    loginUrl: loginUrl || 'https://sistema.smuebleria.com/Login.aspx',
    wcfUrl: wcfUrl || 'https://sistema.smuebleria.com/smuebleriaservice.svc',
    user: user,
    pass: pass,
    masterUserId: parseInt(masterId || '38954', 10) || 38954,
    lpptSpreadsheetId: lpptId || LPPT_READONLY_DEFAULT_ID_
  };
}

function isErpJwtValid_(token, minBufferSec) {
  const raw = String(token || '').trim();
  const parts = raw.split('.');
  if (parts.length < 2) return false;
  const buffer = (minBufferSec !== undefined && minBufferSec !== null) ? Number(minBufferSec) : 600;
  try {
    const b64 = parts[1] + '==='.slice((parts[1].length + 3) % 4);
    const jsonTxt = Utilities.newBlob(Utilities.base64DecodeWebSafe(b64)).getDataAsString('UTF-8');
    const payload = JSON.parse(jsonTxt);
    const exp = Number(payload.exp || 0);
    return exp > (Math.floor(Date.now() / 1000) + buffer);
  } catch (e) {
    return false;
  }
}

function buildCookieHeaderFromCacheObj_(cacheObj) {
  if (!cacheObj) return '';
  if (cacheObj.cookieHeader) return String(cacheObj.cookieHeader);
  const arr = Array.isArray(cacheObj.cookies) ? cacheObj.cookies : [];
  const pairs = [];
  for (let i = 0; i < arr.length; i++) {
    const c = arr[i];
    if (c && c.name && c.value !== undefined) {
      pairs.push(c.name + '=' + c.value);
    }
  }
  return pairs.join('; ');
}

function readDriveErpSessionCache_() {
  try {
    const folder = findPresentacionDisenoDriveFolder_();
    if (!folder) return null;
    const subIt = folder.getFoldersByName('credenciales');
    if (!subIt.hasNext()) return null;
    const credFolder = subIt.next();
    const fIt = credFolder.getFilesByName('.erp_session_cache.json');
    if (!fIt.hasNext()) return null;
    return JSON.parse(fIt.next().getBlob().getDataAsString('UTF-8'));
  } catch (e) {
    return null;
  }
}

function saveErpSessionCacheEverywhere_(sessionObj) {
  try {
    PropertiesService.getScriptProperties().setProperty('ERP_SESSION_CACHE_JSON', JSON.stringify(sessionObj));
  } catch (e) {}
  try {
    const folder = findPresentacionDisenoDriveFolder_();
    if (!folder) return;
    const subIt = folder.getFoldersByName('credenciales');
    const credFolder = subIt.hasNext() ? subIt.next() : folder.createFolder('credenciales');
    const fIt = credFolder.getFilesByName('.erp_session_cache.json');
    const jsonStr = JSON.stringify(sessionObj);
    if (fIt.hasNext()) {
      fIt.next().setContent(jsonStr);
    } else {
      credFolder.createFile('.erp_session_cache.json', jsonStr, MimeType.PLAIN_TEXT);
    }
  } catch (e) {}
}

function getHeaderCaseInsensitive_(headersObj, targetName) {
  if (!headersObj || !targetName) return '';
  const want = String(targetName).toLowerCase();
  const keys = Object.keys(headersObj);
  for (let i = 0; i < keys.length; i++) {
    if (keys[i].toLowerCase() === want) {
      const val = headersObj[keys[i]];
      return Array.isArray(val) ? String(val[0] || '') : String(val || '');
    }
  }
  return '';
}

function mergeSetCookiesIntoJar_(headersObj, jar) {
  if (!headersObj) return;
  const keys = Object.keys(headersObj);
  for (let k = 0; k < keys.length; k++) {
    if (keys[k].toLowerCase() !== 'set-cookie') continue;
    const raw = headersObj[keys[k]];
    if (!raw) continue;
    const list = Array.isArray(raw) ? raw : [raw];
    for (let i = 0; i < list.length; i++) {
      const firstPart = String(list[i] || '').split(';')[0].trim();
      const eq = firstPart.indexOf('=');
      if (eq > 0) {
        const cname = firstPart.slice(0, eq).trim();
        const cval = firstPart.slice(eq + 1).trim();
        if (cname) jar[cname] = cval;
      }
    }
  }
}

function cookieJarToHeader_(jar) {
  return Object.keys(jar).map((k) => k + '=' + jar[k]).join('; ');
}

function extractHtmlInputAttr_(tagHtml, attrName) {
  const re = new RegExp('(?:^|\\s)' + attrName + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s>]+))', 'i');
  const m = String(tagHtml || '').match(re);
  if (!m) return '';
  return decodeXmlEntities_(m[1] !== undefined ? m[1] : (m[2] !== undefined ? m[2] : (m[3] || '')));
}

function resolveRelativeUrl_(baseUrl, locationHdr) {
  let loc = decodeXmlEntities_(String(locationHdr || '').trim());
  if (!loc) return String(baseUrl || 'https://sistema.smuebleria.com/Login.aspx');
  if (/^https?:\/\//i.test(loc)) return loc;
  const baseStr = String(baseUrl || 'https://sistema.smuebleria.com/Login.aspx');
  const originMatch = baseStr.match(/^(https?:\/\/[^\/]+)/i);
  const origin = originMatch ? originMatch[1] : 'https://sistema.smuebleria.com';
  if (loc.indexOf('//') === 0) return 'https:' + loc;
  if (loc.charAt(0) === '/') return origin + loc;
  while (loc.indexOf('./') === 0) loc = loc.slice(2);
  const pathWithoutQuery = baseStr.split('?')[0].split('#')[0];
  const lastSlash = pathWithoutQuery.lastIndexOf('/');
  const baseDir = lastSlash > origin.length ? pathWithoutQuery.slice(0, lastSlash + 1) : (origin + '/');
  return baseDir + loc;
}

function extractJwtTokenFromTextOrJar_(text, jar) {
  const s = String(text || '');
  const mTok = s.match(/Token=([a-zA-Z0-9_\-\.]{20,})/);
  if (mTok && isErpJwtValid_(mTok[1], 15)) return mTok[1];
  const mJwt = s.match(/\b(eyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,})\b/);
  if (mJwt && isErpJwtValid_(mJwt[1], 15)) return mJwt[1];
  if (jar && jar.access_token && isErpJwtValid_(jar.access_token, 15)) return jar.access_token;
  if (mTok) return mTok[1];
  return '';
}

function performSingleErpHttpLogin_(user, pass, loginUrl) {
  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
  const jar = {};
  let pageUrl = loginUrl || 'https://sistema.smuebleria.com/Login.aspx';
  let loginHtml = '';

  for (let gHop = 0; gHop < 4; gHop++) {
    const getHdrs = { 'User-Agent': ua, Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' };
    const ck = cookieJarToHeader_(jar);
    if (ck) getHdrs.Cookie = ck;
    const getResp = UrlFetchApp.fetch(pageUrl, {
      method: 'get',
      headers: getHdrs,
      followRedirects: false,
      muteHttpExceptions: true
    });
    mergeSetCookiesIntoJar_(getResp.getAllHeaders(), jar);
    const gCode = getResp.getResponseCode();
    const gLoc = getHeaderCaseInsensitive_(getResp.getAllHeaders(), 'Location');
    if (gCode >= 300 && gCode < 400 && gLoc) {
      pageUrl = resolveRelativeUrl_(pageUrl, gLoc);
      continue;
    }
    loginHtml = getResp.getContentText('UTF-8');
    break;
  }

  let postActionUrl = pageUrl;
  const formTagMatch = loginHtml.match(/<form\b[^>]*>/i);
  if (formTagMatch) {
    const rawAction = extractHtmlInputAttr_(formTagMatch[0], 'action');
    if (rawAction) postActionUrl = resolveRelativeUrl_(pageUrl, rawAction);
  }

  const formFields = {};
  let emailFieldName = 'CampoCorreoElectronico';
  let passFieldName = 'CampoContrasena';
  let submitFieldName = 'BotonValidar';
  let submitFieldVal = 'Ingresar';
  let submitFieldType = 'submit';
  let hasSubmitInput = false;

  const inputTags = loginHtml.match(/<input\b[^>]*>/gi) || [];
  for (let i = 0; i < inputTags.length; i++) {
    const tag = inputTags[i];
    const type = (extractHtmlInputAttr_(tag, 'type') || 'text').toLowerCase();
    const name = extractHtmlInputAttr_(tag, 'name');
    const id = extractHtmlInputAttr_(tag, 'id');
    const val = extractHtmlInputAttr_(tag, 'value');

    if (/CampoCorreoElectronico$/i.test(id) || /CampoCorreoElectronico$/i.test(name)) {
      if (name) emailFieldName = name;
      continue;
    }
    if (/CampoContrasena$/i.test(id) || /CampoContrasena$/i.test(name)) {
      if (name) passFieldName = name;
      continue;
    }
    if (/BotonValidar$/i.test(id) || /BotonValidar$/i.test(name)) {
      hasSubmitInput = true;
      if (name) submitFieldName = name;
      if (val) submitFieldVal = val;
      submitFieldType = type || 'submit';
      continue;
    }

    if (!name) continue;
    if (type === 'submit' || type === 'button' || type === 'reset' || type === 'image' || type === 'file') continue;
    if (type === 'checkbox' || type === 'radio') {
      if (/\bchecked\b/i.test(tag)) formFields[name] = val || 'on';
      continue;
    }
    formFields[name] = val;
  }

  formFields[emailFieldName] = user;
  formFields[passFieldName] = pass;

  // Los campos de Login.aspx son Telerik RadTextBox: el servidor toma el valor desde el JSON
  // oculto "<campo>_ClientState" (lo llena el navegador al teclear). Sin él, el POST ignora
  // usuario/contraseña y la renovación automática del token 24h nunca ocurre.
  const buildRadClientState_ = (v) => JSON.stringify({
    enabled: true,
    emptyMessage: '',
    validationText: String(v),
    valueAsString: String(v),
    lastSetTextBoxValue: String(v)
  });
  formFields[emailFieldName + '_ClientState'] = buildRadClientState_(user);
  formFields[passFieldName + '_ClientState'] = buildRadClientState_(pass);

  if (hasSubmitInput && submitFieldType === 'image') {
    formFields[submitFieldName + '.x'] = '12';
    formFields[submitFieldName + '.y'] = '12';
  } else if (hasSubmitInput) {
    formFields[submitFieldName] = submitFieldVal;
  } else {
    const postBackMatch = loginHtml.match(/BotonValidar[^>]*__doPostBack\(\s*['"]([^'"]+)['"]/i);
    if (postBackMatch) {
      formFields.__EVENTTARGET = postBackMatch[1];
      formFields.__EVENTARGUMENT = formFields.__EVENTARGUMENT || '';
    } else {
      formFields[submitFieldName] = submitFieldVal;
    }
  }

  const encodedPayload = Object.keys(formFields)
    .map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(formFields[k] !== undefined && formFields[k] !== null ? String(formFields[k]) : ''))
    .join('&');

  const originMatch = postActionUrl.match(/^(https?:\/\/[^\/]+)/i);
  const originHdr = originMatch ? originMatch[1] : 'https://sistema.smuebleria.com';
  const postHeaders = {
    'User-Agent': ua,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    Origin: originHdr,
    Referer: pageUrl
  };
  const postCk = cookieJarToHeader_(jar);
  if (postCk) postHeaders.Cookie = postCk;

  let curResp = UrlFetchApp.fetch(postActionUrl, {
    method: 'post',
    contentType: 'application/x-www-form-urlencoded',
    payload: encodedPayload,
    headers: postHeaders,
    followRedirects: false,
    muteHttpExceptions: true
  });
  mergeSetCookiesIntoJar_(curResp.getAllHeaders(), jar);

  let currentUrl = postActionUrl;
  let finalHtml = curResp.getContentText('UTF-8');
  let tokenFound = '';

  for (let hop = 0; hop < 6; hop++) {
    const code = curResp.getResponseCode();
    const hdrs = curResp.getAllHeaders();
    const loc = getHeaderCaseInsensitive_(hdrs, 'Location');
    if (loc) {
      const tokInLoc = extractJwtTokenFromTextOrJar_(loc, null);
      if (tokInLoc) tokenFound = tokInLoc;
    }

    if (code >= 300 && code < 400 && loc) {
      currentUrl = resolveRelativeUrl_(currentUrl, loc);
      const rHdrs = { 'User-Agent': ua, Referer: pageUrl };
      const rCk = cookieJarToHeader_(jar);
      if (rCk) rHdrs.Cookie = rCk;
      curResp = UrlFetchApp.fetch(currentUrl, {
        method: 'get',
        headers: rHdrs,
        followRedirects: false,
        muteHttpExceptions: true
      });
      mergeSetCookiesIntoJar_(curResp.getAllHeaders(), jar);
      finalHtml = curResp.getContentText('UTF-8');
    } else {
      break;
    }
  }

  if (!tokenFound) {
    tokenFound = extractJwtTokenFromTextOrJar_(finalHtml, jar);
  }

  // Seguir redirección JS o meta-refresh hacia Sistema.aspx si existe
  if (!tokenFound) {
    const jsRedir = String(finalHtml || '').match(/(?:location(?:\.href)?\s*=\s*|location\.replace\(\s*|url\s*=\s*)['"]?([^'"\s<>]*Sistema\.aspx[^'"\s<>]*)/i);
    if (jsRedir && jsRedir[1]) {
      currentUrl = resolveRelativeUrl_(currentUrl, jsRedir[1]);
      tokenFound = extractJwtTokenFromTextOrJar_(currentUrl, null);
      if (!tokenFound) {
        const jHdrs = { 'User-Agent': ua, Referer: postActionUrl };
        const jCk = cookieJarToHeader_(jar);
        if (jCk) jHdrs.Cookie = jCk;
        const jResp = UrlFetchApp.fetch(currentUrl, {
          method: 'get',
          headers: jHdrs,
          followRedirects: true,
          muteHttpExceptions: true
        });
        mergeSetCookiesIntoJar_(jResp.getAllHeaders(), jar);
        finalHtml = jResp.getContentText('UTF-8');
        tokenFound = extractJwtTokenFromTextOrJar_(finalHtml, jar);
      }
    }
  }

  // Si ya recibimos cookies de sesión autenticada pero aún no consultamos Sistema.aspx, consultarlo explícitamente
  if (!tokenFound && Object.keys(jar).length > 0 && !/Sistema\.aspx/i.test(currentUrl)) {
    const sisUrl = resolveRelativeUrl_(postActionUrl, '/Sistema.aspx');
    const sHdrs = { 'User-Agent': ua, Referer: postActionUrl };
    const sCk = cookieJarToHeader_(jar);
    if (sCk) sHdrs.Cookie = sCk;
    const sResp = UrlFetchApp.fetch(sisUrl, {
      method: 'get',
      headers: sHdrs,
      followRedirects: true,
      muteHttpExceptions: true
    });
    mergeSetCookiesIntoJar_(sResp.getAllHeaders(), jar);
    finalHtml = sResp.getContentText('UTF-8');
    tokenFound = extractJwtTokenFromTextOrJar_(finalHtml, jar);
  }

  return { token: tokenFound, jar: jar };
}

/**
 * Renueva automáticamente el JWT 24h de S Mueblería directo desde Google Cloud vía HTTP WebForms.
 */
function loginErpViaHttp_(cfg) {
  if (!cfg.user || !cfg.pass) {
    throw new Error('No se encontraron credenciales ERP en ScriptProperties ni en la carpeta privada PRESENTACION_DISENO.');
  }

  // Evitar intentos repetidos de login fallido dentro del mismo ciclo (protege la cuenta en S Mueblería)
  let loginCache = null;
  try { loginCache = CacheService.getScriptCache(); } catch (ce) {}
  if (loginCache && loginCache.get('erp_login_fail_v1') === '1') {
    throw new Error(
      'La sesión de 24h de S Mueblería venció y el último intento de renovación automática fue rechazado hace menos de 4 minutos. ' +
      'Se reintentará en el siguiente ciclo.'
    );
  }

  let attemptRes = performSingleErpHttpLogin_(cfg.user, cfg.pass, cfg.loginUrl);

  // Si falló, verificar si el archivo .env en Google Drive tiene credenciales actualizadas respecto a ScriptProperties
  if (!attemptRes.token) {
    try {
      const folder = findPresentacionDisenoDriveFolder_();
      if (folder) {
        const fIt = folder.getFilesByName('.env');
        if (fIt.hasNext()) {
          const envMap = parseDotEnvText_(fIt.next().getBlob().getDataAsString('UTF-8'));
          const freshUser = (envMap.ERP_USER || '').trim();
          const freshPass = (envMap.ERP_PASS || '').trim();
          const freshLogin = (envMap.ERP_LOGIN_URL || cfg.loginUrl || '').trim();
          if (freshUser && freshPass && (freshUser !== cfg.user || freshPass !== cfg.pass)) {
            PropertiesService.getScriptProperties().setProperties({
              ERP_USER: freshUser,
              ERP_PASS: freshPass
            });
            attemptRes = performSingleErpHttpLogin_(freshUser, freshPass, freshLogin);
          }
        }
      }
    } catch (envRetryErr) {}
  }

  const tokenFound = attemptRes.token;
  const jar = attemptRes.jar || {};
  if (!tokenFound) {
    try { if (loginCache) loginCache.put('erp_login_fail_v1', '1', 240); } catch (cpe) {}
    throw new Error(
      'La sesión de 24h de S Mueblería venció y Login.aspx rechazó la renovación automática sin navegador. ' +
      'Ejecuta iniciar_servicio_en_vivo.bat en tu PC o verifica ERP_USER / ERP_PASS en PRESENTACION_DISENO/.env.'
    );
  }

  const cookiesArr = Object.keys(jar).map((k) => ({
    name: k,
    value: jar[k],
    domain: 'sistema.smuebleria.com',
    path: '/'
  }));
  const sessionObj = {
    token: tokenFound,
    cookies: cookiesArr,
    saved_at: Date.now() / 1000
  };
  saveErpSessionCacheEverywhere_(sessionObj);
  return {
    token: tokenFound,
    cookieHeader: cookieJarToHeader_(jar)
  };
}

function getValidErpSession_(forceRefresh, cfg) {
  const props = PropertiesService.getScriptProperties();
  let parsedProp = null;
  let driveCached = null;

  if (!forceRefresh) {
    try {
      const rawProp = props.getProperty('ERP_SESSION_CACHE_JSON');
      if (rawProp) {
        parsedProp = JSON.parse(rawProp);
        if (parsedProp && isErpJwtValid_(parsedProp.token, 600)) {
          return {
            token: parsedProp.token,
            cookieHeader: buildCookieHeaderFromCacheObj_(parsedProp)
          };
        }
      }
    } catch (e) {}

    driveCached = readDriveErpSessionCache_();
    if (driveCached && isErpJwtValid_(driveCached.token, 600)) {
      try {
        props.setProperty('ERP_SESSION_CACHE_JSON', JSON.stringify(driveCached));
      } catch (e) {}
      return {
        token: driveCached.token,
        cookieHeader: buildCookieHeaderFromCacheObj_(driveCached)
      };
    }
  }

  try {
    return loginErpViaHttp_(cfg || getErpRuntimeConfig_());
  } catch (loginErr) {
    // Si la renovación anticipada falla pero el token actual aún no expira en el servidor (margen >15s), aprovecharlo
    if (!forceRefresh) {
      if (driveCached && isErpJwtValid_(driveCached.token, 15)) {
        return {
          token: driveCached.token,
          cookieHeader: buildCookieHeaderFromCacheObj_(driveCached)
        };
      }
      if (parsedProp && isErpJwtValid_(parsedProp.token, 15)) {
        return {
          token: parsedProp.token,
          cookieHeader: buildCookieHeaderFromCacheObj_(parsedProp)
        };
      }
    }
    throw loginErr;
  }
}

function buildSmuebleriaSoapEnvelope_(wcfUrl, soapAction, method, innerRendered) {
  return '<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://www.w3.org/2005/08/addressing">' +
    '<s:Header>' +
      '<a:Action s:mustUnderstand="1">' + soapAction + '</a:Action>' +
      '<a:To s:mustUnderstand="1">' + wcfUrl + '</a:To>' +
    '</s:Header>' +
    '<s:Body>' +
      '<' + method + ' xmlns="http://tempuri.org/">' +
        innerRendered +
      '</' + method + '>' +
    '</s:Body>' +
  '</s:Envelope>';
}

function callSmuebleriaWcf_(method, innerXml) {
  const cfg = getErpRuntimeConfig_();
  let sess = getValidErpSession_(false, cfg);
  const soapAction = 'http://tempuri.org/ISMuebleriaService/' + method;

  for (let attempt = 0; attempt < 2; attempt++) {
    const safeTokenXml = xmlEscape_(sess.token);
    const rendered = String(innerXml || '').replace(/<ClaveServicio>\{TOKEN\}<\/ClaveServicio>/g, '<ClaveServicio>' + safeTokenXml + '</ClaveServicio>');
    const envelope = buildSmuebleriaSoapEnvelope_(cfg.wcfUrl, soapAction, method, rendered);
    const headers = {
      Authorization: 'Bearer ' + sess.token,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    };
    if (sess.cookieHeader) headers.Cookie = sess.cookieHeader;

    const resp = UrlFetchApp.fetch(cfg.wcfUrl, {
      method: 'post',
      contentType: 'application/soap+xml; charset=utf-8; action="' + soapAction + '"',
      headers: headers,
      payload: Utilities.newBlob(envelope, 'application/soap+xml; charset=utf-8').getBytes(),
      muteHttpExceptions: true
    });

    const code = resp.getResponseCode();
    const respText = resp.getContentText('UTF-8');
    const isAuthFault500 = code === 500 && /token|clave\s*servicio|autoriz|sesi[oó]n|expir/i.test(respText);
    if ((code === 401 || code === 403 || isAuthFault500) && attempt === 0) {
      sess = getValidErpSession_(true, cfg);
      continue;
    }
    if (code !== 200) {
      throw new Error('Error WCF S Mueblería (' + method + '): HTTP ' + code + ' - ' + respText.slice(0, 300));
    }
    return respText;
  }
  throw new Error('No fue posible autenticar la petición WCF en ' + method);
}

function buscarProductoPorClaveWcf_(sku) {
  const cfg = getErpRuntimeConfig_();
  const claveClean = String(sku || '').trim();
  if (!claveClean) return null;
  const xmlText = callSmuebleriaWcf_(
    'ObtenerProductos',
    '<ClaveServicio>{TOKEN}</ClaveServicio><IdUsuario>' + cfg.masterUserId + '</IdUsuario><Filtro>' + xmlEscape_(claveClean) + '</Filtro>'
  );
  // Buscar bloques que contengan <Clave> y <IdProducto>
  const itemRe = /<([a-zA-Z0-9_:]*Producto[a-zA-Z0-9_:]*)>([\s\S]*?)<\/\1>/g;
  let m;
  let fallback = null;
  while ((m = itemRe.exec(xmlText)) !== null) {
    const blk = m[2];
    const idProd = extractXmlTag_(blk, 'IdProducto');
    const clave = extractXmlTag_(blk, 'Clave');
    if (!idProd || !clave) continue;
    const item = {
      IdProducto: idProd,
      Clave: clave,
      Nombre: extractXmlTag_(blk, 'Nombre'),
      Precio: parseFloat(extractXmlTag_(blk, 'Precio') || '0') || 0
    };
    if (!fallback) fallback = item;
    if (clave.toUpperCase() === claveClean.toUpperCase()) return item;
  }
  return fallback;
}

function crearProspectoProvisionalWcf_(nombre, telefono, correo, idUsuarioResponsable) {
  const inner =
    '<ClaveServicio>{TOKEN}</ClaveServicio>' +
    '<IdUsuario>' + idUsuarioResponsable + '</IdUsuario>' +
    '<IdLead>0</IdLead>' +
    '<Nombre>' + xmlEscape_(String(nombre || '').trim() || 'PROSPECTO PRESENTACION') + '</Nombre>' +
    '<Paterno></Paterno>' +
    '<Materno></Materno>' +
    '<Correo>' + xmlEscape_(String(correo || '').trim()) + '</Correo>' +
    '<FechaNacimiento>2000-01-01T00:00:00</FechaNacimiento>' +
    '<Telefono>' + xmlEscape_(String(telefono || '').trim()) + '</Telefono>' +
    '<Celular>' + xmlEscape_(String(telefono || '').trim()) + '</Celular>' +
    '<Oficina></Oficina>' +
    '<IdResponsable>' + idUsuarioResponsable + '</IdResponsable>' +
    '<IdFase>0</IdFase>' +
    '<IdOrigen>0</IdOrigen>' +
    '<Casa2></Casa2>' +
    '<Nextel></Nextel>' +
    '<Extension></Extension>' +
    '<IdTipoCliente>1</IdTipoCliente>';

  const xmlResp = callSmuebleriaWcf_('InsertarLead', inner);
  const m = xmlResp.match(/<[^>]*InsertarLeadResult>(-?\d+)</);
  const idLead = m ? parseInt(m[1], 10) : 0;
  if (!idLead || idLead <= 0) {
    throw new Error('Error al crear prospecto provisional en S Mueblería: ' + xmlResp.slice(0, 260));
  }
  return idLead;
}

function extractFolioForIdVentaXml_(xmlCot, newId) {
  if (!xmlCot || !newId) return '';
  const idRe = new RegExp('<(?:[a-zA-Z0-9_]+:)?IdVenta>' + String(newId) + '<\\/(?:[a-zA-Z0-9_]+:)?IdVenta>');
  const m = idRe.exec(xmlCot);
  if (!m) return '';
  const pos = m.index;
  const winStart = Math.max(0, pos - 4000);
  const winEnd = Math.min(xmlCot.length, pos + 4000);
  const chunk = xmlCot.slice(winStart, winEnd);
  const relPos = pos - winStart;

  const before = chunk.slice(0, relPos);
  const after = chunk.slice(relPos);

  // Acotar exactamente al registro actual (entre el IdVenta previo y el siguiente IdVenta)
  const prevIdIdx = before.lastIndexOf('IdVenta>');
  const safeBefore = prevIdIdx >= 0 ? before.slice(prevIdIdx) : before;
  const boundaryRe = /<\/([a-zA-Z0-9_:]+)>\s*<\1[\s>]/g;
  let bMatch;
  let itemStartInSafe = 0;
  while ((bMatch = boundaryRe.exec(safeBefore)) !== null) {
    itemStartInSafe = bMatch.index + bMatch[0].indexOf('<', 2);
  }
  const recordBefore = safeBefore.slice(itemStartInSafe);

  const nextIdMatch = after.slice(m[0].length).search(/<(?:[a-zA-Z0-9_]+:)?IdVenta>/);
  const recordAfter = nextIdMatch >= 0 ? after.slice(0, m[0].length + nextIdMatch) : after;

  return extractXmlTag_(recordBefore + recordAfter, 'Folio');
}

function parseDeliveryDateToErpIso_(dateStr) {
  const s = String(dateStr || '').trim();
  let dt = null;
  let m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) {
    dt = new Date(parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10));
  } else {
    m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) {
      dt = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
    }
  }
  if (!dt || isNaN(dt.getTime())) {
    dt = new Date();
    dt.setDate(dt.getDate() + 30);
  }
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return yyyy + '-' + mm + '-' + dd + 'T00:00:00';
}

function insertarCotizacionDirectoWcf_(opts) {
  const cfg = getErpRuntimeConfig_();
  const tasaIva = 0.16;
  const idCotizacion = Number(opts.idCotizacion || 0);
  const idUsuarioAsesor = Number(opts.idUsuarioAsesor);
  const idCliente = Number(opts.idCliente || 0);
  const idLead = Number(opts.idLead || 0);
  const descuentoExtra = Math.max(0, Number(opts.descuentoExtra || 0));
  const partidas = opts.partidas || [];

  let sumPartidas = 0;
  const itemsXml = [];
  for (let i = 0; i < partidas.length; i++) {
    const p = partidas[i];
    const idProd = parseInt(String(p.IdProducto), 10);
    const cant = Math.max(1, Math.round(Number(p.Cantidad) || 1));
    const precioOrig = Number(p.PrecioOriginal || 0);
    const precioUnit = Number(p.PrecioUnitario || 0);
    const totLinea = Math.round(cant * precioUnit * 10000) / 10000;
    sumPartidas += totLinea;

    const modeloTxt = xmlEscape_((String(p.Clave || '') + ' ' + String(p.Nombre || '')).trim());
    const precioF = '$' + precioUnit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    // Orden alfabético estricto requerido por DataContractSerializer de S Mueblería WCF
    itemsXml.push(
      '<b:ProductosVentas>' +
        '<b:Bodega>0</b:Bodega>' +
        '<b:Cantidad>' + cant + '</b:Cantidad>' +
        '<b:CantidadDescontinuada>0</b:CantidadDescontinuada>' +
        '<b:CantidadOriginal>' + cant + '</b:CantidadOriginal>' +
        '<b:Descripcion> </b:Descripcion>' +
        '<b:Detalle i:nil="true"/>' +
        '<b:DiasEntrega>0</b:DiasEntrega>' +
        '<b:EsTela>false</b:EsTela>' +
        '<b:Estatus i:nil="true"/>' +
        '<b:IdCategoria>0</b:IdCategoria>' +
        '<b:IdModleo>0</b:IdModleo>' +
        '<b:IdMoneda>0</b:IdMoneda>' +
        '<b:IdPaquete>0</b:IdPaquete>' +
        '<b:IdProducto>' + idProd + '</b:IdProducto>' +
        '<b:IdProductoTelaLigada>0</b:IdProductoTelaLigada>' +
        '<b:IdPromocion>0</b:IdPromocion>' +
        '<b:IdProveedor>0</b:IdProveedor>' +
        '<b:IdRama>0</b:IdRama>' +
        '<b:IdTiempoEntrega>0</b:IdTiempoEntrega>' +
        '<b:ImagenVenta/>' +
        '<b:IvaProducto>' + tasaIva.toFixed(4) + '</b:IvaProducto>' +
        '<b:Mensaje1>Material Base:</b:Mensaje1>' +
        '<b:Mensaje2>Material Cubierta:</b:Mensaje2>' +
        '<b:Mensaje3>Material Otro:</b:Mensaje3>' +
        '<b:MetrosMaterial2>0.0000</b:MetrosMaterial2>' +
        '<b:MetrosMaterial3>0.0000</b:MetrosMaterial3>' +
        '<b:MetrosMaterial4>0.0000</b:MetrosMaterial4>' +
        '<b:MetrosMaterial5>0.0000</b:MetrosMaterial5>' +
        '<b:MetrosTela>0.0000</b:MetrosTela>' +
        '<b:Modelo>' + modeloTxt + '</b:Modelo>' +
        '<b:PedirTelaLigada>false</b:PedirTelaLigada>' +
        '<b:Piso>0</b:Piso>' +
        '<b:Precio>' + precioUnit.toFixed(4) + '</b:Precio>' +
        '<b:PrecioF>' + xmlEscape_(precioF) + '</b:PrecioF>' +
        '<b:PrecioMinimo>0.0000</b:PrecioMinimo>' +
        '<b:PrecioOriginal>' + precioOrig.toFixed(4) + '</b:PrecioOriginal>' +
        '<b:PrecioOriginalCotizador>0.0000</b:PrecioOriginalCotizador>' +
        '<b:Total>' + totLinea.toFixed(4) + '</b:Total>' +
      '</b:ProductosVentas>'
    );
  }

  const totalFinal = Math.max(0, sumPartidas - descuentoExtra);
  const subtotal = Math.round((totalFinal / (1 + tasaIva)) * 10000) / 10000;
  const iva = Math.round((totalFinal - subtotal) * 10000) / 10000;

  const productosBlock =
    '<Productos xmlns:b="http://schemas.datacontract.org/2004/07/" xmlns:i="http://www.w3.org/2001/XMLSchema-instance">' +
      itemsXml.join('') +
    '</Productos>';

  const inner =
    '<ClaveServicio>{TOKEN}</ClaveServicio>' +
    '<IdCotizacion>' + idCotizacion + '</IdCotizacion>' +
    '<IdCliente>' + idCliente + '</IdCliente>' +
    '<IdLead>' + idLead + '</IdLead>' +
    '<Nombre>' + xmlEscape_(opts.nombreCliente || 'PROSPECTO PRESENTACION') + '</Nombre>' +
    '<FechaEntrega>' + opts.fechaEntregaIso + '</FechaEntrega>' +
    '<IdUsuario>' + idUsuarioAsesor + '</IdUsuario>' +
    '<subtotal>' + subtotal.toFixed(4) + '</subtotal>' +
    '<iva>' + iva.toFixed(4) + '</iva>' +
    '<Total>' + totalFinal.toFixed(4) + '</Total>' +
    '<descuento>' + descuentoExtra.toFixed(4) + '</descuento>' +
    productosBlock +
    '<Comentarios>' + xmlEscape_(opts.comentarios || '') + '</Comentarios>' +
    '<IdCategoriaVenta>' + Number(opts.idCategoriaVenta || 2) + '</IdCategoriaVenta>' +
    '<TAX>0</TAX>' +
    '<IdDireccion>0</IdDireccion>' +
    '<IdFormaPagoCredito>0</IdFormaPagoCredito>' +
    '<IdTipoPago>0</IdTipoPago>' +
    '<PagoParcial>0</PagoParcial>' +
    '<NoPagosCredito>0</NoPagosCredito>' +
    '<Enganche>0</Enganche>' +
    '<TipoCambio>0</TipoCambio>' +
    '<IdMoneda>0</IdMoneda>' +
    '<IdCajero>' + idUsuarioAsesor + '</IdCajero>' +
    '<IdOrigen>0</IdOrigen>' +
    '<TasaIva>' + tasaIva.toFixed(4) + '</TasaIva>';

  const xmlResp = callSmuebleriaWcf_('InsertarCotizacion', inner);
  const m = xmlResp.match(/<[^>]*InsertarCotizacionResult>([^<]+)</);
  const rawRes = m ? m[1].trim() : '';
  const newId = /^\d+$/.test(rawRes) ? parseInt(rawRes, 10) : 0;
  if (!newId || newId <= 0) {
    throw new Error('S Mueblería no devolvió un ID de cotización válido (' + (rawRes || xmlResp.slice(0, 200)) + ').');
  }

  let folioOficial = '';
  try {
    const xmlCot = callSmuebleriaWcf_(
      'ObtenerCotizacionesTodas',
      '<ClaveServicio>{TOKEN}</ClaveServicio><IdUsuario>' + cfg.masterUserId + '</IdUsuario><Venta></Venta><Filtro></Filtro>'
    );
    folioOficial = extractFolioForIdVentaXml_(xmlCot, newId);
  } catch (folioErr) {
    Logger.log('Aviso al consultar Folio en ObtenerCotizacionesTodas: ' + folioErr);
  }

  return {
    idCotizacion: newId,
    folio: folioOficial,
    subtotal: subtotal,
    iva: iva,
    total: totalFinal
  };
}

function readPlantillaProductCatalogMap_(shPlantilla) {
  const map = {};
  if (!shPlantilla || shPlantilla.getLastColumn() < 34 || shPlantilla.getLastRow() < 2) return map;
  const vals = shPlantilla.getRange(2, 31, shPlantilla.getLastRow() - 1, 4).getValues(); // AE..AH
  for (let i = 0; i < vals.length; i++) {
    const r = vals[i];
    const sku = String(r[0] || '').trim().toUpperCase();
    if (!sku) continue;
    map[sku] = {
      idProducto: cleanSheetKeyCell_(r[1]),
      nombre: String(r[2] || '').trim(),
      precio: Number(r[3] || 0) || 0
    };
  }
  return map;
}

/**
 * Procesa la cotización exigiendo identidad autenticada por correo, bloqueando Sucursal/Proyecto
 * y enviando EN VIVO directo a S Mueblería ERP (sistema.smuebleria.com).
 */
function acquireScriptLockSafe_(ms) {
  const lock = LockService.getScriptLock();
  const waitMs = Math.max(1000, Number(ms) || 15000);
  try {
    if (typeof lock.tryLock === 'function') {
      return { lock: lock, ok: !!lock.tryLock(waitMs) };
    }
    lock.waitLock(waitMs);
    return { lock: lock, ok: true };
  } catch (eLock) {
    return { lock: lock, ok: false, error: (eLock && eLock.message) ? eLock.message : String(eLock) };
  }
}

function escapeSheetPlainText_(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  const s = String(v);
  if (!s) return '';
  return /^[=+\-@]/.test(s.replace(/^\s+/, '')) ? ("'" + s) : s;
}

function safeSheetCellText_(raw, maxLen) {
  let s = String(raw === null || raw === undefined ? '' : raw).replace(/[\r\n\t]+/g, ' ').trim();
  if (maxLen && s.length > maxLen) s = s.slice(0, maxLen).trim();
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}

function handleInvSubmitQuote_(body) {
  const lockState = acquireScriptLockSafe_(25000);
  if (!lockState.ok) {
    return {
      ok: false,
      retryable: true,
      error: 'El servidor está procesando otra operación en este momento. Intenta de nuevo en unos segundos.'
    };
  }
  const lock = lockState.lock;
  try {
    ensureLiveErpSyncTrigger_();
    const ss = getSpreadsheet_();
    const sh = ss.getSheetByName('plantilla');
    if (!sh) {
      return { ok: false, error: 'No se encontró la hoja "plantilla" en CONTROL DE PRODUCTOS PRESENTACIÓN.' };
    }

    const erpMeta = readErpAdvisorsFromPlantilla_(ss);
    const authCheck = resolveAuthenticatedAdvisor_(ss, erpMeta.advisors, body);
    if (!authCheck.ok) {
      return authCheck;
    }
    const verifiedUser = authCheck.advisor;
    if (isGuestReadOnlyUser_(verifiedUser)) {
      return {
        ok: false,
        error: 'Acceso de Solo Lectura (Hoja INVITADOS): tu correo tiene permiso únicamente para ver el inventario; no puede generar cotizaciones ni aplicar descuentos.'
      };
    }
    if (!userHasEffectivePerm_(verifiedUser, 'cotizador')) {
      return {
        ok: false,
        forbidden: true,
        error: 'Tu cuenta tiene desactivado el permiso VER_COTIZADOR en CUENTAS ADMINISTRATIVAS.'
      };
    }

    const items = Array.isArray(body.items) ? body.items : [];
    if (!items.length) {
      return { ok: false, error: 'Agrega al menos un producto a la cotización.' };
    }
    if (items.length > 15) {
      return { ok: false, error: 'La plantilla admite máximo 15 partidas por cotización (tienes ' + items.length + ').' };
    }

    // Administradores (con VER_CAMBIAR_TIENDA activo) pueden emitir y supervisar en cualquier tienda/bodega;
    // Asesores y Gerentes quedan bloqueados estrictamente a la tienda/proyecto de su cuenta en sesión.
    let erpStore = verifiedUser.erpStore;
    let idUsuarioNum = parseInt(String(verifiedUser.erpAdvisorId || '').trim(), 10) || 0;
    let erpAdvisorLabel = verifiedUser.erpAdvisorLabel || '';
    const canAdminSwitchStore = userHasAdminPerm_(verifiedUser, 'cambiarTienda');

    if (canAdminSwitchStore) {
      const reqStore = String(body.erpStore || '').trim();
      if (reqStore) erpStore = reqStore;
      const reqAdvLabel = String(body.erpAdvisorLabel || '').trim();
      const reqAdvId = parseInt(String(body.erpAdvisorId || extractErpIdFromLabel_(reqAdvLabel) || '').trim(), 10) || 0;
      if (reqAdvId > 0) {
        idUsuarioNum = reqAdvId;
        if (reqAdvLabel) {
          erpAdvisorLabel = reqAdvLabel;
        } else {
          const foundAdv = erpMeta.advisors.find((a) => String(a.id) === String(reqAdvId));
          erpAdvisorLabel = foundAdv ? foundAdv.label : (verifiedUser.nombre + ' | ' + erpStore + ' [ID: ' + reqAdvId + ']');
        }
      }
    }

    if (!idUsuarioNum && Array.isArray(authCheck.userMatches)) {
      const anyMatchWithId = authCheck.userMatches.find((u) => !u.isGuest && (parseInt(String(u.erpAdvisorId || '').trim(), 10) || 0) > 0);
      if (anyMatchWithId) {
        idUsuarioNum = parseInt(String(anyMatchWithId.erpAdvisorId || '').trim(), 10) || 0;
        erpAdvisorLabel = erpAdvisorLabel || anyMatchWithId.erpAdvisorLabel || (verifiedUser.nombre + ' | ' + erpStore + ' [ID: ' + idUsuarioNum + ']');
      }
    }

    if (!idUsuarioNum && !verifiedUser.isGuest) {
      const cfg = getErpRuntimeConfig_();
      idUsuarioNum = cfg.masterUserId;
      erpAdvisorLabel = erpAdvisorLabel || (verifiedUser.nombre + ' | ' + erpStore + ' [ID: ' + idUsuarioNum + ']');
    }

    const activePrefix = getStoreFolioPrefix_(erpStore, verifiedUser.orderPrefix);
    const isProyQuote = /PROYECTO/i.test(erpStore) || (!verifiedUser.isAdmin && !!verifiedUser.isProyecto);
    const activeQuoteType = isProyQuote ? 'PROYECTO' : (verifiedUser.isAdmin ? 'ADMINISTRATIVO' : verifiedUser.quoteType);

    const sendToErp = body.sendToErp !== false;
    if (sendToErp && (!idUsuarioNum || idUsuarioNum <= 0)) {
      return {
        ok: false,
        error: 'Tu cuenta (' + verifiedUser.correo + ') aún no tiene un ID de usuario activo vinculado en S Mueblería.'
      };
    }

    const categoryLabel = 'COTIZACIONES [ID: 2]';
    const clientNameRaw = String(body.clientName || '').trim() || (isProyQuote ? 'PROYECTO CREATA' : 'PROSPECTO EN TIENDA');
    const explicitCliId = parseInt(String(body.erpClientId || '').trim(), 10) || 0;
    const explicitLeadId = parseInt(String(body.erpLeadId || '').trim(), 10) || 0;
    const clientMode = explicitCliId > 0
      ? (clientNameRaw + ' [ID CLIENTE: ' + explicitCliId + ']')
      : (explicitLeadId > 0
        ? (clientNameRaw + ' [ID LEAD: ' + explicitLeadId + ']')
        : 'PROSPECTO PROVISIONAL (SOLO NOMBRE - MODIFICABLE AL CERRAR)');
    const clientPhone = String(body.clientPhone || '').trim();
    const deliveryDate = String(body.deliveryDate || '').trim();
    const rawNotes = String(body.notes || '').trim();
    const extraDiscount = Math.max(0, Number(body.extraDiscount) || 0);

    // Límite de descuento por cuenta (Columna I "Descuento": Asesor 30% hasta 30/11/2026 [24% desde 01/12/2026] · Gerente/Admin 100%)
    const maxDiscPct = getMaxDiscountPctForUser_(verifiedUser);
    let sumListReq = 0;
    let sumNetReq = 0;
    for (let i = 0; i < items.length; i++) {
      const it = items[i] || {};
      const pct = Math.max(0, Number(it.discountPct) || 0);
      if (pct > maxDiscPct + 0.0001) {
        registrarEventoHistorial_(ss, {
          clasificacion: 'ALERTA TÉCNICA',
          modulo: 'AppsScript · handleInvSubmitQuote_',
          evento: 'DESCUENTO RECHAZADO POR TOPE DE PUESTO',
          estado: '⚠️ BLOQUEADO',
          usuario: (verifiedUser.nombre || verifiedUser.correo) + ' (' + verifiedUser.correo + ')',
          sucursal: erpStore,
          referencia: String(it.sku || ''),
          detalle: 'Descuento solicitado ' + pct + '% supera el máximo permitido de ' + maxDiscPct + '% para ' + (verifiedUser.puesto || 'ASESOR') + '.',
          analisis: 'Control de descuento activo: Asesores 30% hasta 30/11/2026 (24% desde 01/12/2026); Gerentes y Administradores 100%.'
        });
        return {
          ok: false,
          error: 'Tu cuenta (' + (verifiedUser.puesto || 'ASESOR') + ') permite un descuento máximo de ' + maxDiscPct + '% por partida. Revisa el SKU ' + String(it.sku || '') + '.'
        };
      }
      const qtyReq = Math.max(1, Math.round(Number(it.qty) || 1));
      const listReq = Math.max(0, Number(it.unitList) || 0) * qtyReq;
      sumListReq += listReq;
      sumNetReq += listReq * (1 - pct / 100);
    }
    if (sumListReq > 0 && extraDiscount > 0) {
      const effPct = ((sumListReq - Math.max(0, sumNetReq - extraDiscount)) / sumListReq) * 100;
      if (effPct > maxDiscPct + 0.01) {
        registrarEventoHistorial_(ss, {
          clasificacion: 'ALERTA TÉCNICA',
          modulo: 'AppsScript · handleInvSubmitQuote_',
          evento: 'DESCUENTO EXTRA RECHAZADO POR TOPE DE PUESTO',
          estado: '⚠️ BLOQUEADO',
          usuario: (verifiedUser.nombre || verifiedUser.correo) + ' (' + verifiedUser.correo + ')',
          sucursal: erpStore,
          referencia: 'Descuento extra $' + extraDiscount.toFixed(2),
          detalle: 'Descuento total efectivo ' + effPct.toFixed(1) + '% supera el máximo permitido de ' + maxDiscPct + '%.',
          analisis: 'Control de descuento acumulado activo sobre partidas + descuento extra.'
        });
        return {
          ok: false,
          error: 'El descuento total (' + effPct.toFixed(1) + '%) supera el máximo permitido para tu cuenta (' + maxDiscPct + '%).'
        };
      }
    }

    const shQuotes = ensureQuotesLedgerSheet_(ss);
    const folioSnapBefore = sendToErp
      ? readLocalFoliosBaseline_(ss)
      : computeLiveErpFoliosAndQuotes_(ss, erpMeta.advisors);
    const estimatedFolio = peekNextStoreErpFolio_(erpStore, activePrefix, folioSnapBefore);
    const originHeaderTag = isProyQuote
      ? ('[PROYECTO · ' + erpStore + ' · ' + verifiedUser.nombre + ' <' + verifiedUser.correo + '>]')
      : ('[' + erpStore + ' · ' + verifiedUser.nombre + ' <' + verifiedUser.correo + '>]');
    const finalNotesForErp = rawNotes ? (originHeaderTag + ' ' + rawNotes) : originHeaderTag;

    // 1) Mantener K5 en SOLO REVISIÓN para que ningún script externo reenvíe por duplicado (K8 intacta [BLOQUEADO-5])
    sh.getRange('K5').setValue('SOLO REVISIÓN (NO ENVIAR AL ERP)');
    sh.getRange('K7').clearContent();
    sh.getRange('M7').clearContent();

    // 2) Escribir tienda/bodega y datos del cliente en bloques compactos en plantilla
    if (erpAdvisorLabel) {
      sh.getRange('C5:C7').setValues([[erpStore], [erpAdvisorLabel], [categoryLabel]]);
    } else {
      sh.getRange('C5').setValue(erpStore);
      sh.getRange('C7').setValue(categoryLabel);
    }
    sh.getRange('C9:C11').setValues([[clientMode], [clientNameRaw], [finalNotesForErp]]);
    sh.getRange('G9').setNumberFormat('@');
    if (deliveryDate) {
      sh.getRange('G9:G10').setValues([[clientPhone], [deliveryDate]]);
    } else {
      sh.getRange('G9').setValue(clientPhone);
    }
    sh.getRange('H30').setValue(extraDiscount);

    // 3) Escribir columnas editables B (SKU), D (Cantidad), F (% Desc) en filas 15..29
    const bVals = [];
    const dVals = [];
    const fVals = [];
    for (let i = 0; i < 15; i++) {
      if (i < items.length) {
        const it = items[i] || {};
        const sku = String(it.sku || '').trim().toUpperCase();
        const qty = Math.max(1, Math.round(Number(it.qty) || 1));
        let discPct = (Number(it.discountPct) || 0) / 100;
        discPct = Math.max(0, Math.min(1, discPct));
        bVals.push([sku]);
        dVals.push([qty]);
        fVals.push([discPct]);
      } else {
        bVals.push(['']);
        dVals.push(['']);
        fVals.push(['']);
      }
    }
    sh.getRange(15, 2, 15, 1).setNumberFormat('@').setValues(bVals);
    sh.getRange(15, 4, 15, 1).setValues(dVals);
    sh.getRange(15, 6, 15, 1).setValues(fVals);

    const ahoraStr = formatCancunNow_();
    if (!sendToErp) {
      sh.getRange('K6').setValue('🟢 EN REVISIÓN (' + estimatedFolio + ' · ' + activeQuoteType + ')');
      sh.getRange('K9').setValue(ahoraStr);
      SpreadsheetApp.flush();
      const histPreviewOk = !!registrarEventoHistorial_(ss, {
        clasificacion: 'MOVIMIENTO',
        modulo: 'AppsScript · plantilla',
        evento: 'COTIZACIÓN GUARDADA EN REVISIÓN',
        estado: '✅ OK',
        usuario: (verifiedUser.nombre || verifiedUser.correo) + ' (' + verifiedUser.correo + ')',
        sucursal: erpStore,
        referencia: estimatedFolio,
        detalle: 'Borrador en hoja plantilla para ' + clientNameRaw + ' (' + items.length + ' partidas).',
        analisis: 'Guardada en modo SOLO REVISIÓN sin envío a S Mueblería.'
      });
      const previewStatus = handleInvPlantillaStatus_();
      previewStatus.orderCode = estimatedFolio;
      previewStatus.folioFinal = estimatedFolio;
      previewStatus.nextOrderCode = estimatedFolio;
      previewStatus.nextFolioByStore = folioSnapBefore.nextFolioByStore;
      previewStatus.quoteType = activeQuoteType;
      previewStatus.isProyecto = isProyQuote;
      previewStatus.serieLabel = verifiedUser.serieLabel;
      previewStatus.sentLiveToErp = false;
      previewStatus.items = items;
      previewStatus.serverLoggedSeguimiento = false;
      previewStatus.serverLoggedHistorial = histPreviewOk;
      const allowedPreview = readAllowedGeneratedQuotesForUser_(ss, shQuotes, verifiedUser, authCheck.allUsers, erpStore);
      previewStatus.recentQuotes = allowedPreview.quotes;
      previewStatus.roleScope = allowedPreview.roleScope;
      previewStatus.activeStore = allowedPreview.activeStore;
      previewStatus.branchAdvisorEmails = allowedPreview.allowedAdvisorEmails;
      return previewStatus;
    }

    // 4) Resolver IdProducto y precios reales para enviar EN VIVO directo a S Mueblería WCF
    //    (y respaldo automático por cola en plantilla!K5 si la sesión caché en Drive requiere renovación)
    const catalogMap = readPlantillaProductCatalogMap_(sh);
    let needSheetFormulaRead = false;
    for (let i = 0; i < items.length; i++) {
      const skuCheck = String((items[i] && items[i].sku) || '').trim().toUpperCase();
      const catCheck = catalogMap[skuCheck];
      if (!catCheck || !catCheck.idProducto || !/^\d+$/.test(String(catCheck.idProducto)) || Number(catCheck.precio || 0) <= 0) {
        needSheetFormulaRead = true;
        break;
      }
    }
    let sheetRows = [];
    if (needSheetFormulaRead) {
      SpreadsheetApp.flush();
      sheetRows = sh.getRange(15, 2, items.length, 12).getValues(); // B..M
    }

    const partidasErp = [];
    const partidasForSeg = [];
    const skusSummaryParts = [];

    const displayClientForErp = isProyQuote && !/^\[?PROYECTO/i.test(clientNameRaw)
      ? ('PROYECTO - ' + clientNameRaw)
      : clientNameRaw;

    try {
      for (let i = 0; i < items.length; i++) {
        const reqItem = items[i] || {};
        const rSheet = sheetRows[i] || [];
        const sku = String(reqItem.sku || rSheet[0] || '').trim().toUpperCase();
        const cant = Math.max(1, Math.round(Number(reqItem.qty || rSheet[2]) || 1));
        let discFrac = (Number(reqItem.discountPct) || 0) / 100;
        discFrac = Math.max(0, Math.min(1, discFrac));

        const catEntry = catalogMap[sku] || {};
        let idProd = cleanSheetKeyCell_(rSheet[11]) || catEntry.idProducto || '';
        let nombreProd = String(rSheet[1] || catEntry.nombre || reqItem.name || sku).trim();
        let precioOrig = Number(rSheet[3] || catEntry.precio || 0) || 0;

        if (!idProd || !/^\d+$/.test(idProd) || precioOrig <= 0) {
          const liveProd = buscarProductoPorClaveWcf_(sku);
          if (!liveProd || !liveProd.IdProducto) {
            registrarEventoHistorial_(ss, {
              clasificacion: 'FALLO DE CÓDIGO',
              modulo: 'AppsScript WCF · BuscarProductoPorClave',
              evento: 'SKU NO ENCONTRADO EN S MUEBLERÍA',
              estado: '❌ ERROR',
              usuario: (verifiedUser.nombre || verifiedUser.correo) + ' (' + verifiedUser.correo + ')',
              sucursal: erpStore,
              referencia: sku,
              detalle: 'Intento de cotizar SKU "' + sku + '" sin IdProducto activo en S Mueblería.',
              analisis: 'El SKU debe estar dado de alta en el catálogo oficial de sistema.smuebleria.com antes de emitir cotización.'
            });
            return {
              ok: false,
              error: 'El SKU "' + sku + '" no existe o no está dado de alta en el sistema S Mueblería.'
            };
          }
          idProd = String(liveProd.IdProducto).trim();
          if (!nombreProd || nombreProd.indexOf('SKU no') >= 0) {
            nombreProd = liveProd.Nombre || sku;
          }
          if (precioOrig <= 0 && liveProd.Precio > 0) {
            precioOrig = Number(liveProd.Precio);
          }
        }
        if (precioOrig <= 0) {
          return {
            ok: false,
            error: 'El SKU ' + sku + ' no tiene precio de lista válido en S Mueblería.'
          };
        }

        const precioUnit = Math.round(precioOrig * (1 - discFrac) * 10000) / 10000;
        const partidaObj = {
          Clave: sku,
          Nombre: nombreProd,
          Cantidad: cant,
          PrecioOriginal: precioOrig,
          PrecioUnitario: precioUnit,
          IdProducto: idProd
        };
        partidasErp.push(partidaObj);
        partidasForSeg.push(Object.assign({}, partidaObj, {
          model: reqItem.model || reqItem.modelo || '',
          stockBreakdown: reqItem.stockBreakdown || reqItem.stockBodegas || reqItem.stocks || reqItem.inventario || reqItem.stockByLoc || null
        }));
        skusSummaryParts.push(sku + ' x' + cant);
      }

      if (extraDiscount > 0 && partidasErp.length > 0) {
        let sumListErp = 0;
        let sumNetErp = 0;
        for (let pIdx = 0; pIdx < partidasErp.length; pIdx++) {
          const pItem = partidasErp[pIdx];
          sumListErp += Math.max(0, Number(pItem.PrecioOriginal) || 0) * Math.max(1, Number(pItem.Cantidad) || 1);
          sumNetErp += Math.max(0, Number(pItem.PrecioUnitario) || 0) * Math.max(1, Number(pItem.Cantidad) || 1);
        }
        if (sumListErp > 0) {
          const effErpPct = ((sumListErp - Math.max(0, sumNetErp - extraDiscount)) / sumListErp) * 100;
          if (effErpPct > maxDiscPct + 0.01) {
            return {
              ok: false,
              error: 'El descuento total (' + effErpPct.toFixed(1) + '%) sobre precios ERP supera el máximo permitido para tu cuenta (' + maxDiscPct + '%).'
            };
          }
        }
      }

      const idCategoriaVenta = 2;
      const clientEmail = String(body.clientEmail || '').trim();
      let idCliente = 0;
      let idLead = 0;

      if (explicitCliId > 0) {
        idCliente = explicitCliId;
        idLead = 0;
      } else if (explicitLeadId > 0) {
        idCliente = 0;
        idLead = explicitLeadId;
      } else {
        idLead = crearProspectoProvisionalWcf_(displayClientForErp, clientPhone, clientEmail, idUsuarioNum);
      }

      const fechaEntregaIso = parseDeliveryDateToErpIso_(deliveryDate);
      const erpResult = insertarCotizacionDirectoWcf_({
        idCotizacion: 0,
        idUsuarioAsesor: idUsuarioNum,
        idCliente: idCliente,
        idLead: idLead,
        nombreCliente: displayClientForErp,
        fechaEntregaIso: fechaEntregaIso,
        comentarios: finalNotesForErp,
        idCategoriaVenta: idCategoriaVenta,
        partidas: partidasErp,
        descuentoExtra: extraDiscount
      });

      const folioFinal = erpResult.folio || estimatedFolio || ('ID-' + erpResult.idCotizacion);
      const refSujeto = idLead ? ('Lead ' + idLead) : ('Cliente ' + idCliente);
      const statusBannerTxt = '✅ COTIZACIÓN CREADA (' + ahoraStr + ') · FOLIO ' + folioFinal + ' · ' + refSujeto;

      // Batch K5:K7 + M7 + K9 sin tocar jamás plantilla!K8 ([BLOQUEADO-5])
      sh.getRange('K5:K7').setValues([
        ['SOLO REVISIÓN (NO ENVIAR AL ERP)'],
        [statusBannerTxt],
        [String(erpResult.idCotizacion)]
      ]);
      sh.getRange('M7').setValue(folioFinal);
      // Conservar intacta la fórmula nativa de K8 en plantilla (PRESENTACION_DISENO)
      sh.getRange('K9').setValue(ahoraStr);

      // 5) Registrar el mismo folio oficial en COTIZACIONES_EN_VIVO con marca ORIGEN_CREACION = APP_COTIZACION (Col Y)
      shQuotes.appendRow([
        folioFinal,
        folioFinal,
        String(erpResult.idCotizacion),
        ahoraStr,
        activeQuoteType,
        verifiedUser.sheetTab,
        erpStore,
        verifiedUser.correo,
        escapeSheetPlainText_(verifiedUser.nombre),
        escapeSheetPlainText_(erpAdvisorLabel),
        String(idUsuarioNum),
        escapeSheetPlainText_(safeSheetCellText_(displayClientForErp, 160)),
        escapeSheetPlainText_(safeSheetCellText_(clientPhone, 60)),
        escapeSheetPlainText_(safeSheetCellText_(clientMode, 180)),
        escapeSheetPlainText_(categoryLabel),
        escapeSheetPlainText_(deliveryDate),
        partidasErp.length,
        escapeSheetPlainText_(skusSummaryParts.join(', ')),
        erpResult.subtotal,
        erpResult.iva,
        extraDiscount,
        erpResult.total,
        'COTIZACIÓN REGISTRADA',
        escapeSheetPlainText_(safeSheetCellText_(rawNotes, 500)),
        'APP_COTIZACION'
      ]);
      const appendedRow = shQuotes.getLastRow();
      shQuotes.getRange(appendedRow, 19, 1, 4).setNumberFormat('$#,##0.00');

      const segLoggedOk = !!registrarCotizacionAppEnSeguimiento_(ss, {
        folio: folioFinal,
        fechaStr: Utilities.formatDate(new Date(), 'America/Cancun', 'yyyy-MM-dd'),
        sheetTab: verifiedUser.sheetTab,
        erpStore: erpStore,
        advisorName: verifiedUser.nombre,
        advisorEmail: verifiedUser.correo,
        clientName: displayClientForErp,
        clientPhone: clientPhone,
        partidas: partidasForSeg
      });

      const histLoggedOk = !!registrarEventoHistorial_(ss, {
        clasificacion: 'MOVIMIENTO',
        modulo: 'AppsScript WCF · InsertarCotizacion',
        evento: 'COTIZACIÓN CREADA EN S MUEBLERÍA',
        estado: '✅ OK',
        usuario: (verifiedUser.nombre || verifiedUser.correo) + ' (' + verifiedUser.correo + ')',
        sucursal: erpStore,
        referencia: 'Folio ' + folioFinal + ' (ID ERP ' + erpResult.idCotizacion + ')',
        detalle: 'Cliente: ' + displayClientForErp + ' · Total: $' + Number(erpResult.total || 0).toFixed(2) + ' · Partidas: ' + skusSummaryParts.join(', '),
        analisis: 'Inserción directa WCF SOAP 1.2 exitosa en sistema.smuebleria.com con usuario ERP ' + idUsuarioNum + '.'
      });

      SpreadsheetApp.flush();

      const folioSnapAfter = updateFoliosCacheLocally_(folioSnapBefore, folioFinal);
      const nextStoreFolio = peekNextStoreErpFolio_(erpStore, activePrefix, folioSnapAfter);
      const allowedAfterDirect = readAllowedGeneratedQuotesForUser_(ss, shQuotes, verifiedUser, authCheck.allUsers, erpStore);

      return {
        ok: true,
        erpStore: erpStore,
        erpAdvisor: erpAdvisorLabel,
        erpUserId: String(idUsuarioNum),
        actionState: 'SOLO REVISIÓN (NO ENVIAR AL ERP)',
        erpStatus: statusBannerTxt,
        quoteId: String(erpResult.idCotizacion),
        folio: folioFinal,
        folioFinal: folioFinal,
        subjectRef: refSujeto,
        lastSync: ahoraStr,
        extraDiscount: extraDiscount > 0 ? formatMoney_(extraDiscount) : '$0.00',
        subtotal: formatMoney_(erpResult.subtotal),
        iva: formatMoney_(erpResult.iva),
        total: formatMoney_(erpResult.total),
        sentLiveToErp: true,
        orderCode: folioFinal,
        nextOrderCode: nextStoreFolio,
        nextFolioByStore: folioSnapAfter.nextFolioByStore,
        quoteType: activeQuoteType,
        isProyecto: isProyQuote,
        serieLabel: verifiedUser.serieLabel,
        items: partidasErp,
        serverLoggedSeguimiento: segLoggedOk,
        serverLoggedHistorial: histLoggedOk,
        recentQuotes: allowedAfterDirect.quotes,
        roleScope: allowedAfterDirect.roleScope,
        activeStore: allowedAfterDirect.activeStore,
        branchAdvisorEmails: allowedAfterDirect.allowedAdvisorEmails
      };
    } catch (wcfErr) {
      // Respaldo automático: si el token caché en Drive expiró, encolar en plantilla!K5 para que servicio_en_vivo.py la suba e hidrate sesión
      const fallbackSummary = items.map(it => String(it.sku || '').trim().toUpperCase() + ' x' + Math.max(1, Math.round(Number(it.qty) || 1))).filter(Boolean);
      sh.getRange('K7').clearContent();
      sh.getRange('M7').clearContent();
      sh.getRange('K6').setValue('⏳ EN COLA AUTOMÁTICA PARA S MUEBLERÍA (' + ahoraStr + ')');
      // Conservar intacta plantilla!K8 ([BLOQUEADO-5])
      sh.getRange('K9').setValue(ahoraStr);
      sh.getRange('K5').setValue('ENVIAR COTIZACIÓN A S MUEBLERÍA');
      SpreadsheetApp.flush();

      let daemonQid = '';
      let daemonFolio = '';
      let daemonStatus = '';
      for (let poll = 0; poll < 5; poll++) {
        Utilities.sleep(3000);
        SpreadsheetApp.flush();
        daemonQid = String(sh.getRange('K7').getDisplayValue() || '').trim();
        daemonFolio = String(sh.getRange('M7').getDisplayValue() || '').trim();
        daemonStatus = String(sh.getRange('K6').getDisplayValue() || '').trim();
        if (daemonQid || daemonFolio) break;
        if (/ERROR/i.test(daemonStatus)) break;
      }

      if (daemonQid || daemonFolio) {
        const folioResolved = daemonFolio || estimatedFolio || ('ID-' + daemonQid);
        const totRangeVals = sh.getRange('H31:H33').getValues();
        const subSheet = Number(totRangeVals[0][0]) || 0;
        const ivaSheet = Number(totRangeVals[1][0]) || 0;
        const totSheet = Number(totRangeVals[2][0]) || 0;

        shQuotes.appendRow([
          folioResolved,
          folioResolved,
          daemonQid,
          ahoraStr,
          activeQuoteType,
          verifiedUser.sheetTab,
          erpStore,
          verifiedUser.correo,
          escapeSheetPlainText_(verifiedUser.nombre),
          escapeSheetPlainText_(erpAdvisorLabel),
          String(idUsuarioNum),
          escapeSheetPlainText_(safeSheetCellText_(displayClientForErp, 160)),
          escapeSheetPlainText_(safeSheetCellText_(clientPhone, 60)),
          escapeSheetPlainText_(safeSheetCellText_(clientMode, 180)),
          escapeSheetPlainText_(categoryLabel),
          escapeSheetPlainText_(deliveryDate),
          items.length,
          escapeSheetPlainText_(fallbackSummary.join(', ')),
          subSheet,
          ivaSheet,
          extraDiscount,
          totSheet,
          'COTIZACIÓN REGISTRADA (VÍA SERVICIO)',
          escapeSheetPlainText_(safeSheetCellText_(rawNotes, 500)),
          'APP_COTIZACION'
        ]);
        const appRow = shQuotes.getLastRow();
        shQuotes.getRange(appRow, 19, 1, 4).setNumberFormat('$#,##0.00');
        const segLoggedDaemon = !!registrarCotizacionAppEnSeguimiento_(ss, {
          folio: folioResolved,
          fechaStr: Utilities.formatDate(new Date(), 'America/Cancun', 'yyyy-MM-dd'),
          sheetTab: verifiedUser.sheetTab,
          erpStore: erpStore,
          advisorName: verifiedUser.nombre,
          advisorEmail: verifiedUser.correo,
          clientName: displayClientForErp,
          clientPhone: clientPhone,
          partidas: partidasForSeg.length ? partidasForSeg : items
        });
        const histLoggedDaemon = !!registrarEventoHistorial_(ss, {
          clasificacion: 'MOVIMIENTO',
          modulo: 'AppsScript + servicio_en_vivo.py',
          evento: 'COTIZACIÓN CREADA VÍA COLA DE RESPALDO',
          estado: '✅ OK',
          usuario: (verifiedUser.nombre || verifiedUser.correo) + ' (' + verifiedUser.correo + ')',
          sucursal: erpStore,
          referencia: 'Folio ' + folioResolved + ' (ID ERP ' + daemonQid + ')',
          detalle: 'Cotización completada por servicio_en_vivo.py tras aviso WCF inicial (' + String((wcfErr && wcfErr.message) || wcfErr).slice(0, 140) + ').',
          analisis: analizarCausaFalloCodigo_(wcfErr, 'AppsScript WCF · InsertarCotizacion', 'fallback_daemon')
        });
        SpreadsheetApp.flush();

        const snapAfterDaemon = updateFoliosCacheLocally_(folioSnapBefore, folioResolved);
        const nextAfterDaemon = peekNextStoreErpFolio_(erpStore, activePrefix, snapAfterDaemon);
        const outDaemon = handleInvPlantillaStatus_();
        outDaemon.sentLiveToErp = true;
        outDaemon.orderCode = folioResolved;
        outDaemon.folioFinal = folioResolved;
        outDaemon.nextOrderCode = nextAfterDaemon;
        outDaemon.nextFolioByStore = snapAfterDaemon.nextFolioByStore;
        outDaemon.quoteType = activeQuoteType;
        outDaemon.isProyecto = isProyQuote;
        outDaemon.serieLabel = verifiedUser.serieLabel;
        outDaemon.folio = folioResolved;
        outDaemon.quoteId = daemonQid;
        outDaemon.erpUserId = String(idUsuarioNum);
        outDaemon.erpStatus = daemonStatus;
        outDaemon.items = partidasErp.length ? partidasErp : items;
        outDaemon.serverLoggedSeguimiento = segLoggedDaemon;
        outDaemon.serverLoggedHistorial = histLoggedDaemon;
        const allowedAfterDaemon = readAllowedGeneratedQuotesForUser_(ss, shQuotes, verifiedUser, authCheck.allUsers, erpStore);
        outDaemon.recentQuotes = allowedAfterDaemon.quotes;
        outDaemon.roleScope = allowedAfterDaemon.roleScope;
        outDaemon.activeStore = allowedAfterDaemon.activeStore;
        outDaemon.branchAdvisorEmails = allowedAfterDaemon.allowedAdvisorEmails;
        return outDaemon;
      }

      const histQueuedOk = !!registrarEventoHistorial_(ss, {
        clasificacion: 'FALLO DE CÓDIGO',
        modulo: 'AppsScript WCF · InsertarCotizacion',
        evento: 'ENVÍO WCF DIRECTO EN COLA DE RESPALDO',
        estado: '⚠️ EN COLA',
        usuario: (verifiedUser.nombre || verifiedUser.correo) + ' (' + verifiedUser.correo + ')',
        sucursal: erpStore,
        referencia: estimatedFolio + ' (' + displayClientForErp + ')',
        detalle: String((wcfErr && wcfErr.message) || wcfErr || 'Fallo WCF directo'),
        analisis: analizarCausaFalloCodigo_(wcfErr, 'AppsScript WCF · InsertarCotizacion', 'inv_submit_quote')
      });

      const queuedOut = handleInvPlantillaStatus_();
      queuedOut.sentLiveToErp = false;
      queuedOut.queuedForDaemon = true;
      queuedOut.wcfReason = String((wcfErr && wcfErr.message) || wcfErr || '');
      queuedOut.orderCode = estimatedFolio;
      queuedOut.folioFinal = estimatedFolio;
      queuedOut.nextOrderCode = estimatedFolio;
      queuedOut.nextFolioByStore = folioSnapBefore.nextFolioByStore;
      queuedOut.quoteType = activeQuoteType;
      queuedOut.isProyecto = isProyQuote;
      queuedOut.serieLabel = verifiedUser.serieLabel;
      queuedOut.items = partidasErp.length ? partidasErp : items;
      queuedOut.serverLoggedSeguimiento = false;
      queuedOut.serverLoggedHistorial = histQueuedOk;
      const allowedQueued = readAllowedGeneratedQuotesForUser_(ss, shQuotes, verifiedUser, authCheck.allUsers, erpStore);
      queuedOut.recentQuotes = allowedQueued.quotes;
      queuedOut.roleScope = allowedQueued.roleScope;
      queuedOut.activeStore = allowedQueued.activeStore;
      queuedOut.branchAdvisorEmails = allowedQueued.allowedAdvisorEmails;
      return queuedOut;
    }
  } finally {
    lock.releaseLock();
  }
}

// ----------------------------------------------------------------------------
// DESCARGA DEL PDF ORIGINAL DE COTIZACIÓN GENERADO POR S MUEBLERÍA (SOLO LECTURA)
// Reconstruye exactamente la ruta oficial de Muebleria.dll hacia Telerik Reporting:
//   https://sistema.smuebleria.com/VisorReportes.aspx?Reporte={Reporte}&Parametro={IdVenta}&Usuario={IdUsuario}
//   -> Telerik.ReportViewer.axd?instanceID={instanceID}&optype=Export&ExportFormat=PDF
// Sin modificar absolutamente ningún dato en S Mueblería.
// ----------------------------------------------------------------------------
function parseCookieHeaderToJar_(cookieHeader) {
  const jar = {};
  const raw = String(cookieHeader || '').trim();
  if (!raw) return jar;
  const parts = raw.split(';');
  for (let i = 0; i < parts.length; i++) {
    const seg = parts[i].trim();
    if (!seg) continue;
    const eq = seg.indexOf('=');
    if (eq > 0) {
      const k = seg.slice(0, eq).trim();
      const v = seg.slice(eq + 1).trim();
      if (k) jar[k] = v;
    }
  }
  return jar;
}

function findPdfMagicOffset_(bytes) {
  if (!bytes || bytes.length < 64) return -1;
  const maxScan = Math.min(bytes.length - 5, 32);
  for (let i = 0; i <= maxScan; i++) {
    if (
      (bytes[i] & 0xFF) === 0x25 &&     // %
      (bytes[i + 1] & 0xFF) === 0x50 && // P
      (bytes[i + 2] & 0xFF) === 0x44 && // D
      (bytes[i + 3] & 0xFF) === 0x46 && // F
      (bytes[i + 4] & 0xFF) === 0x2D    // -
    ) {
      return i;
    }
  }
  return -1;
}

function extractCleanPdfBytes_(bytes) {
  const off = findPdfMagicOffset_(bytes);
  if (off < 0) return null;
  return off === 0 ? bytes : bytes.slice(off);
}

function mapFormatoImpresionesToReportName_(formatoRaw, hasImages, idCategoriaVenta) {
  if (Number(idCategoriaVenta) === 304) return 'CotizacionesCredito';
  const fmt = String(formatoRaw || '').trim();
  if (!fmt) return hasImages ? 'CotizacionesFotos' : 'Cotizaciones';
  switch (fmt) {
    case 'Elegante':
      return hasImages ? 'CotizacionesEleganteFotos' : 'CotizacionesElegante';
    case 'CEIMA':
      return 'CotizacionesCEIMA';
    case 'PERMO':
      return 'CotizacionesPERMO';
    case 'HOCHMAN':
      return 'CotizacionesHOCHMAN';
    case 'Stark':
      return 'CotizacionesStark';
    case 'EleganteVP':
      return 'CotizacionesVP';
    case 'Mudomo':
      return 'CotizacionesMudomo';
    case 'Itika':
      return 'CotizacionesItika';
    case 'Festi':
      return 'CotizacionesFesti';
    case 'EleganteDWR':
      return 'CotizacionesDWR';
    case 'EleganteDizzeno':
      return 'CotizacionesDizzeno';
    case 'EleganteDoble':
      return 'CotizacionesDoble';
    case 'EleganteNatulier':
      return 'CotizacionesNatulier';
    case 'EleganteAshley':
      return 'CotizacionesAshley';
    case 'EleganteTerracu':
      return 'CotizacionesTerracu';
    case 'ElegantePerfecto':
      return 'CotizacionesPerfecto';
    case 'FURU':
      return hasImages ? 'CotizacionesFotosFuru' : 'Cotizaciones';
    case 'ARMONIC':
      return hasImages ? 'CotizacionesFotosArmonic' : 'Cotizaciones';
    case 'VAIVEN':
      return hasImages ? 'CotizacionesFotosVaiven' : 'CotizacionesVaiven';
    case 'SANDERMO':
      return 'CotizacionesSandermo';
    case 'SANDERMOUSD':
      return 'CotizacionesSandermoUSD';
    case 'DELGADO':
      return 'CotizacionesDelgado';
    case 'CASANOVA':
      return 'CotizacionCR';
    default:
      return hasImages ? 'CotizacionesEleganteFotos' : 'CotizacionesElegante';
  }
}

function resolveErpQuoteReportCandidates_(idCotizacion, idUsuario, idCategoriaVenta) {
  const cfg = getErpRuntimeConfig_();
  const uid = parseInt(String(idUsuario || ''), 10) || cfg.masterUserId;
  let formato = '';
  let cachedFmtFound = false;

  try {
    const cache = CacheService.getScriptCache();
    const cachedFmt = cache ? cache.get('erp_fmt_imp_v1_' + uid) : null;
    if (cachedFmt !== null && cachedFmt !== undefined) {
      formato = String(cachedFmt);
      cachedFmtFound = true;
    }
  } catch (ce) {}

  if (!cachedFmtFound) {
    try {
      const xmlCfg = callSmuebleriaWcf_(
        'ObtenerConfiguracionVenta',
        '<ClaveServicio>{TOKEN}</ClaveServicio><IdUsuario>' + uid + '</IdUsuario>'
      );
      formato = extractXmlTag_(xmlCfg, 'FormatoImpresiones');
      try {
        CacheService.getScriptCache().put('erp_fmt_imp_v1_' + uid, String(formato || ''), 21600);
      } catch (cePut) {}
    } catch (cfgErr) {
      formato = 'Elegante';
    }
  }

  let hasImages = false;
  try {
    const xmlImg = callSmuebleriaWcf_(
      'ValidarImagenesEnProductosPorCotizacion',
      '<ClaveServicio>{TOKEN}</ClaveServicio><IdCotizaciones>' + parseInt(String(idCotizacion), 10) + '</IdCotizaciones>'
    );
    const rawBool = extractXmlTag_(xmlImg, 'ValidarImagenesEnProductosPorCotizacionResult');
    hasImages = /^true$/i.test(String(rawBool || '').trim());
  } catch (imgErr) {
    hasImages = false;
  }

  const primary = mapFormatoImpresionesToReportName_(formato, hasImages, idCategoriaVenta);
  const candidates = [primary];
  const altSameFmt = mapFormatoImpresionesToReportName_(formato, !hasImages, idCategoriaVenta);
  if (candidates.indexOf(altSameFmt) === -1) candidates.push(altSameFmt);
  if (candidates.indexOf('CotizacionesEleganteFotos') === -1) candidates.push('CotizacionesEleganteFotos');
  if (candidates.indexOf('CotizacionesElegante') === -1) candidates.push('CotizacionesElegante');
  if (candidates.indexOf('Cotizaciones') === -1) candidates.push('Cotizaciones');
  return candidates;
}

function resolveErpQuoteMetadataForPdf_(ss, body) {
  let quoteIdNum = parseInt(String((body && (body.quoteId || body.idCotizacion)) || '').replace(/[^\d]/g, ''), 10) || 0;
  let folioClean = String((body && (body.folio || body.orderCode)) || '').trim().toUpperCase();
  if (/^ID-\d+$/i.test(folioClean)) {
    if (!quoteIdNum) quoteIdNum = parseInt(folioClean.slice(3), 10) || 0;
    folioClean = '';
  } else if (/^[A-Z]+-\d+$/i.test(folioClean)) {
    folioClean = '';
  }

  let erpUserIdNum = parseInt(String((body && (body.erpUserId || body.erpAdvisorId)) || '').replace(/[^\d]/g, ''), 10) || 0;
  let clientName = String((body && body.clientName) || '').trim();
  let erpStore = String((body && body.erpStore) || '').trim();
  let branchTab = '';
  let advisorEmailOwner = '';
  let foundInLedger = false;

  // 1) Buscar coincidencia autoritativa en COTIZACIONES_EN_VIVO para completar quoteId / folio / tienda / propietario
  const shQuotes = ss ? ss.getSheetByName(TAB_QUOTES_LIVE_) : null;
  if (shQuotes && shQuotes.getLastRow() >= 2) {
    const lastR = shQuotes.getLastRow();
    const startR = Math.max(2, lastR - 2000);
    const vals = shQuotes.getRange(startR, 1, lastR - startR + 1, 13).getDisplayValues();
    for (let i = vals.length - 1; i >= 0; i--) {
      const r = vals[i];
      const rOrd = String(r[0] || '').trim().toUpperCase();
      const rFol = String(r[1] || '').trim().toUpperCase();
      const rId = parseInt(String(r[2] || '').replace(/[^\d]/g, ''), 10) || 0;
      const matchById = quoteIdNum > 0 && rId === quoteIdNum;
      const matchByFolio = folioClean && (rFol === folioClean || rOrd === folioClean);
      if (matchById || matchByFolio) {
        foundInLedger = true;
        if (!quoteIdNum && rId > 0) quoteIdNum = rId;
        if (!folioClean && rFol && !/^[A-Z]+-\d+$/i.test(rFol)) folioClean = rFol;
        if (r[5]) branchTab = String(r[5]).trim();
        if (r[6]) erpStore = String(r[6]).trim();
        if (r[7]) advisorEmailOwner = String(r[7]).trim().toLowerCase();
        if (r[10]) erpUserIdNum = parseInt(String(r[10]).replace(/[^\d]/g, ''), 10) || erpUserIdNum;
        if (r[11]) clientName = String(r[11]).trim() || clientName;
        if (quoteIdNum > 0) break;
      }
    }
  }

  // 2) Si solo teníamos el Folio y aún falta IdVenta (quoteIdNum), consultarlo en ObtenerCotizacionesTodas (solo lectura)
  if (!quoteIdNum && folioClean) {
    const cfg = getErpRuntimeConfig_();
    const queries = [
      '<ClaveServicio>{TOKEN}</ClaveServicio><IdUsuario>' + cfg.masterUserId + '</IdUsuario><Venta>' + xmlEscape_(folioClean) + '</Venta><Filtro></Filtro>',
      '<ClaveServicio>{TOKEN}</ClaveServicio><IdUsuario>' + cfg.masterUserId + '</IdUsuario><Venta></Venta><Filtro></Filtro>'
    ];
    for (let qIdx = 0; qIdx < queries.length && !quoteIdNum; qIdx++) {
      try {
        const xmlCot = callSmuebleriaWcf_('ObtenerCotizacionesTodas', queries[qIdx]);
        if (!xmlCot) continue;
        const folRe = new RegExp('<(?:[a-zA-Z0-9_]+:)?Folio>\\s*' + folioClean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*<\\/(?:[a-zA-Z0-9_]+:)?Folio>', 'i');
        const fm = folRe.exec(xmlCot);
        if (fm) {
          const winStart = Math.max(0, fm.index - 2500);
          const winEnd = Math.min(xmlCot.length, fm.index + 2500);
          const chunk = xmlCot.slice(winStart, winEnd);
          const idStr = extractXmlTag_(chunk, 'IdVenta');
          const parsedId = parseInt(String(idStr || '').trim(), 10) || 0;
          if (parsedId > 0) {
            quoteIdNum = parsedId;
            if (!erpUserIdNum) {
              erpUserIdNum = parseInt(String(extractXmlTag_(chunk, 'IdUsuario') || '').trim(), 10) || 0;
            }
            if (!clientName) {
              clientName = extractXmlTag_(chunk, 'Nombre') || extractXmlTag_(chunk, 'Cliente') || '';
            }
          }
        }
      } catch (e) {}
    }
  }

  return {
    quoteIdNum: quoteIdNum,
    folio: folioClean,
    erpUserIdNum: erpUserIdNum,
    clientName: clientName,
    erpStore: erpStore,
    branchTab: branchTab,
    advisorEmailOwner: advisorEmailOwner,
    foundInLedger: foundInLedger
  };
}

function fetchHttpFollowingRedirectsWithJar_(startUrl, jar, ua, refererUrl, maxHops) {
  let curUrl = startUrl;
  const hops = maxHops || 6;
  let lastResp = null;

  for (let hop = 0; hop < hops; hop++) {
    if (/\/Login\.aspx\b/i.test(curUrl)) {
      return { needsLogin: true, finalUrl: curUrl, resp: lastResp };
    }
    const hdrs = {
      'User-Agent': ua,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,application/pdf,*/*;q=0.8'
    };
    if (refererUrl) hdrs.Referer = refererUrl;
    const ck = cookieJarToHeader_(jar);
    if (ck) hdrs.Cookie = ck;

    const resp = UrlFetchApp.fetch(curUrl, {
      method: 'get',
      headers: hdrs,
      followRedirects: false,
      muteHttpExceptions: true
    });
    lastResp = resp;
    mergeSetCookiesIntoJar_(resp.getAllHeaders(), jar);

    const code = resp.getResponseCode();
    if (code === 401 || code === 403) {
      return { needsLogin: true, finalUrl: curUrl, resp: resp };
    }
    const loc = getHeaderCaseInsensitive_(resp.getAllHeaders(), 'Location');
    if (code >= 300 && code < 400 && loc) {
      const nextUrl = resolveRelativeUrl_(curUrl, loc);
      if (/\/Login\.aspx\b/i.test(nextUrl)) {
        return { needsLogin: true, finalUrl: nextUrl, resp: resp };
      }
      curUrl = nextUrl;
      continue;
    }
    return { needsLogin: false, finalUrl: curUrl, resp: resp };
  }
  return { needsLogin: false, finalUrl: curUrl, resp: lastResp };
}

function extractTelerikExportTargetsFromVisorHtml_(html, baseVisorUrl) {
  const s = decodeXmlEntities_(String(html || ''));
  const exportUrls = [];
  const warmUrls = [];
  const pushUnique = (arr, u) => {
    if (u && arr.indexOf(u) === -1) arr.push(u);
  };

  // 1) Localizar rutas a Telerik.ReportViewer.axd en el HTML del visor
  const axdMatches = s.match(/[^\s"'<>()]*Telerik\.ReportViewer\.axd\?[^\s"'<>()]+/gi) || [];
  let firstHandlerBase = '';
  let foundInstanceId = '';
  let cultureSuffix = '';

  for (let i = 0; i < axdMatches.length; i++) {
    const rawAxd = axdMatches[i];
    const fullAxd = resolveRelativeUrl_(baseVisorUrl, rawAxd);
    const qPos = fullAxd.indexOf('?');
    const basePart = qPos >= 0 ? fullAxd.slice(0, qPos) : fullAxd;
    const qsPart = qPos >= 0 ? fullAxd.slice(qPos + 1) : '';
    if (!firstHandlerBase && basePart) firstHandlerBase = basePart;

    const mInst = qsPart.match(/(?:^|&)instanceID=([^&]+)/i);
    if (mInst && !foundInstanceId) {
      foundInstanceId = decodeURIComponent(mInst[1]);
    }
    if (!cultureSuffix) {
      const mCul = qsPart.match(/(?:^|&)(culture=[^&]+)/i);
      const mUiCul = qsPart.match(/(?:^|&)(uiculture=[^&]+)/i);
      cultureSuffix = (mCul ? ('&' + mCul[1]) : '') + (mUiCul ? ('&' + mUiCul[1]) : '');
    }
    if (/optype=ReportArea/i.test(qsPart) || /optype=Parameters/i.test(qsPart)) {
      pushUnique(warmUrls, fullAxd);
    }
    if (/optype=Export/i.test(qsPart) && /ExportFormat=PDF/i.test(qsPart)) {
      pushUnique(exportUrls, fullAxd);
    }
  }

  // 2) Constructor posicional de Telerik WebForms ReportViewer (v8.0.14.507 en VisorReportes.aspx):
  //    new ReportViewer(..., '/Telerik.ReportViewer.axd', '69399ed7e2624f07a16bce78292e2d68', ...)
  if (!foundInstanceId) {
    const ctorMatch = s.match(/new\s+ReportViewer\s*\([\s\S]{0,1400}?(['"])([^'"]*Telerik\.ReportViewer\.axd(?:\?[^'"]*)?)\1\s*,\s*(['"])([a-fA-F0-9\-]{16,64})\3/i) ||
      s.match(/(['"])([^'"]*Telerik\.ReportViewer\.axd(?:\?[^'"]*)?)\1\s*,\s*(['"])([a-fA-F0-9\-]{16,64})\3/i);
    if (ctorMatch) {
      if (!firstHandlerBase && ctorMatch[2]) {
        const resolvedCtorAxd = resolveRelativeUrl_(baseVisorUrl, ctorMatch[2]);
        const qIdx = resolvedCtorAxd.indexOf('?');
        firstHandlerBase = qIdx >= 0 ? resolvedCtorAxd.slice(0, qIdx) : resolvedCtorAxd;
      }
      if (ctorMatch[4]) {
        foundInstanceId = ctorMatch[4];
      }
    }
  }

  // 3) Respaldo adicional: extraer instanceID desde propiedad nombrada JS
  if (!foundInstanceId) {
    const jsInst = s.match(/["']?instanceI[dD]["']?\s*[:=]\s*["']([a-zA-Z0-9\-]{16,64})["']/);
    if (jsInst && jsInst[1]) {
      foundInstanceId = jsInst[1];
    }
  }

  if (!firstHandlerBase) {
    firstHandlerBase = resolveRelativeUrl_(baseVisorUrl, '/Telerik.ReportViewer.axd');
  }

  if (foundInstanceId) {
    if (cultureSuffix) {
      pushUnique(
        exportUrls,
        firstHandlerBase + '?instanceID=' + encodeURIComponent(foundInstanceId) + cultureSuffix + '&optype=Export&ExportFormat=PDF'
      );
    }
    pushUnique(
      exportUrls,
      firstHandlerBase + '?instanceID=' + encodeURIComponent(foundInstanceId) + '&optype=Export&ExportFormat=PDF'
    );
  }

  // 4) Si VisorReportes incrusta un enlace directo a PDF (<embed>, <iframe>, <object>)
  const embedMatches = s.match(/(?:src|data|href)\s*=\s*["']([^"']+\.pdf(?:\?[^"']*)?)["']/gi) || [];
  for (let j = 0; j < embedMatches.length; j++) {
    const mUrl = embedMatches[j].match(/["']([^"']+)["']/);
    if (mUrl && mUrl[1]) {
      pushUnique(exportUrls, resolveRelativeUrl_(baseVisorUrl, mUrl[1]));
    }
  }

  return {
    instanceId: foundInstanceId,
    exportUrls: exportUrls,
    warmUrls: warmUrls
  };
}

function downloadPdfBytesFromVisorUrl_(visorUrl, jar, ua) {
  const visorHop = fetchHttpFollowingRedirectsWithJar_(visorUrl, jar, ua, 'https://sistema.smuebleria.com/Sistema.aspx', 6);
  if (visorHop.needsLogin) {
    return { ok: false, needsLogin: true };
  }
  const resp = visorHop.resp;
  if (!resp) {
    return { ok: false, error: 'Sin respuesta HTTP desde VisorReportes.aspx.' };
  }

  const rawBytes = resp.getContent();
  const directPdf = extractCleanPdfBytes_(rawBytes);
  if (directPdf) {
    return { ok: true, pdfBytes: directPdf };
  }

  const html = resp.getContentText('UTF-8');
  if (/CampoCorreoElectronico|CampoContrasena/i.test(html) || /<form[^>]*action=["'][^"']*Login\.aspx/i.test(html)) {
    return { ok: false, needsLogin: true };
  }

  const code = resp.getResponseCode();
  if (code >= 400) {
    return { ok: false, error: 'VisorReportes.aspx devolvió HTTP ' + code + '.' };
  }

  const targets = extractTelerikExportTargetsFromVisorHtml_(html, visorHop.finalUrl);
  if (!targets.exportUrls.length) {
    return {
      ok: false,
      error: 'VisorReportes.aspx no expuso un documento PDF ni instanceID de Telerik ReportViewer (' + html.replace(/\s+/g, ' ').slice(0, 180) + ').'
    };
  }

  // Intento directo sobre Telerik.ReportViewer.axd?instanceID=...&optype=Export&ExportFormat=PDF
  for (let pass = 0; pass < 2; pass++) {
    if (pass === 1) {
      if (!targets.warmUrls.length) break;
      for (let w = 0; w < targets.warmUrls.length; w++) {
        fetchHttpFollowingRedirectsWithJar_(targets.warmUrls[w], jar, ua, visorHop.finalUrl, 4);
      }
    }
    for (let i = 0; i < targets.exportUrls.length; i++) {
      const expHop = fetchHttpFollowingRedirectsWithJar_(targets.exportUrls[i], jar, ua, visorHop.finalUrl, 6);
      if (expHop.needsLogin) {
        return { ok: false, needsLogin: true };
      }
      if (!expHop.resp) continue;
      const expPdf = extractCleanPdfBytes_(expHop.resp.getContent());
      if (expPdf) {
        return { ok: true, pdfBytes: expPdf };
      }
    }
  }

  return {
    ok: false,
    error: 'Telerik.ReportViewer.axd no devolvió bytes PDF válidos para instanceID=' + (targets.instanceId || 'N/A') + '.'
  };
}

function buildSafeQuotePdfFileName_(folio, quoteId, clientName) {
  const cleanPart = (txt, maxLen) => String(txt || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, maxLen || 28)
    .replace(/^_+|_+$/g, '');

  const fTag = cleanPart(folio || ('ID_' + quoteId), 20) || ('ID_' + quoteId);
  const cTag = cleanPart(clientName, 26);
  return 'CREATA-muebles-cotización_' + fTag + (cTag ? ('_' + cTag) : '') + '.pdf';
}

function handleInvDownloadErpQuotePdf_(body) {
  const ss = getSpreadsheet_();
  const erpMeta = readErpAdvisorsFromPlantilla_(ss);
  const authCheck = resolveAuthenticatedAdvisor_(ss, erpMeta.advisors, body);
  if (!authCheck.ok) {
    return authCheck;
  }
  const verifiedUser = authCheck.advisor;
  if (isGuestReadOnlyUser_(verifiedUser)) {
    return {
      ok: false,
      error: 'Acceso de Solo Lectura (Hoja INVITADOS): tu cuenta no tiene permisos para consultar ni descargar cotizaciones.'
    };
  }
  if (!userHasEffectivePerm_(verifiedUser, 'cotizador')) {
    return {
      ok: false,
      forbidden: true,
      error: 'Tu cuenta tiene desactivado el permiso VER_COTIZADOR en CUENTAS ADMINISTRATIVAS.'
    };
  }

  try {
    const resolved = resolveErpQuoteMetadataForPdf_(ss, body || {});
    if (!resolved.quoteIdNum || resolved.quoteIdNum <= 0) {
      return {
        ok: false,
        error: 'No se encontró el ID oficial de esta cotización en S Mueblería para descargar su PDF original.'
      };
    }

    // Validación estricta de permisos de visualización/descarga por rol y bodega/tienda activa:
    // - Asesor: únicamente sus propias cotizaciones en la bodega/tienda activa de su sesión.
    // - Gerente: únicamente sus propias cotizaciones y las de los asesores de su bodega/tienda activa.
    // - Administrador: acceso completo.
    if (!verifiedUser.isAdmin) {
      const userEmail = String(verifiedUser.correo || '').trim().toLowerCase();
      const userStoreNorm = normalizeQuoteErpStore_(verifiedUser.erpStore, verifiedUser.sheetTab);
      const quoteStoreNorm = normalizeQuoteErpStore_(resolved.erpStore, resolved.branchTab);
      const ownerEmail = String(resolved.advisorEmailOwner || '').trim().toLowerCase();
      const isManager = isManagerUserRole_(verifiedUser);

      if (resolved.foundInLedger) {
        if (!isManager) {
          if (ownerEmail !== userEmail || quoteStoreNorm !== userStoreNorm) {
            return {
              ok: false,
              error: 'Como asesor únicamente puedes ver y descargar los PDFs de tus propias cotizaciones generadas en tu bodega/tienda activa (' + (verifiedUser.erpStore || verifiedUser.sheetTab) + ').'
            };
          }
        } else {
          const allowedMap = getAllowedAdvisorEmailsForManager_(authCheck.allUsers, verifiedUser, userStoreNorm);
          if (quoteStoreNorm !== userStoreNorm || !ownerEmail || !allowedMap[ownerEmail]) {
            return {
              ok: false,
              error: 'Como gerente únicamente puedes ver y descargar los PDFs de tus propias cotizaciones y las de los asesores de tu bodega/tienda (' + (verifiedUser.erpStore || verifiedUser.sheetTab) + ').'
            };
          }
        }
      } else {
        return {
          ok: false,
          error: 'Esta cotización no pertenece a las cotizaciones registradas en tu cuenta y bodega/tienda activa.'
        };
      }
    }

    const cfg = getErpRuntimeConfig_();
    const idUsuarioReporte = resolved.erpUserIdNum ||
      parseInt(String(verifiedUser.erpAdvisorId || '').trim(), 10) ||
      cfg.masterUserId;
    const idCategoriaVenta = parseInt(String((body && body.idCategoriaVenta) || '2'), 10) || 2;
    const reportCandidates = resolveErpQuoteReportCandidates_(resolved.quoteIdNum, idUsuarioReporte, idCategoriaVenta);

    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
    let sess = getValidErpSession_(false, cfg);
    if (!sess.cookieHeader) {
      try {
        sess = getValidErpSession_(true, cfg);
      } catch (relogIgnore) {}
    }

    let lastErrMsg = '';
    for (let authAttempt = 0; authAttempt < 2; authAttempt++) {
      const jar = parseCookieHeaderToJar_(sess.cookieHeader);
      let needFreshLogin = false;

      for (let rIdx = 0; rIdx < reportCandidates.length; rIdx++) {
        const repName = reportCandidates[rIdx];
        const visorUrl = 'https://sistema.smuebleria.com/VisorReportes.aspx?Reporte=' +
          encodeURIComponent(repName) +
          '&Parametro=' + encodeURIComponent(String(resolved.quoteIdNum)) +
          '&Usuario=' + encodeURIComponent(String(idUsuarioReporte));

        const dlRes = downloadPdfBytesFromVisorUrl_(visorUrl, jar, ua);
        if (dlRes && dlRes.ok && dlRes.pdfBytes) {
          const fileName = buildSafeQuotePdfFileName_(resolved.folio, resolved.quoteIdNum, resolved.clientName);
          const pdfBase64 = Utilities.base64Encode(dlRes.pdfBytes);
          const refLabel = (resolved.folio ? ('Folio ' + resolved.folio + ' · ') : '') + 'ID ERP ' + resolved.quoteIdNum;

          let pdfDriveUrl = '';
          let pdfDownloadUrl = '';
          if (body && body.createShareLink === true) {
            try {
              const pdfBlob = Utilities.newBlob(dlRes.pdfBytes, 'application/pdf', fileName);
              let driveFile = null;
              try {
                const parentFld = DriveApp.getFolderById(PRESENTACION_DISENO_FOLDER_ID_);
                const subIt = parentFld.getFoldersByName('COTIZACIONES_PDF_COMPARTIDOS');
                const pdfFld = subIt.hasNext() ? subIt.next() : parentFld.createFolder('COTIZACIONES_PDF_COMPARTIDOS');
                driveFile = pdfFld.createFile(pdfBlob);
              } catch (eFldPdf) {
                driveFile = DriveApp.createFile(pdfBlob);
              }
              try {
                driveFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
              } catch (eShare) {}
              const dId = driveFile.getId();
              if (dId) {
                pdfDriveUrl = 'https://drive.google.com/file/d/' + dId + '/view?usp=sharing';
                pdfDownloadUrl = 'https://drive.google.com/uc?export=download&id=' + dId;
              }
            } catch (eDrivePdf) {}
          }

          registrarEventoHistorial_(ss, {
            clasificacion: 'MOVIMIENTO',
            modulo: 'AppsScript · VisorReportes S Mueblería',
            evento: 'DESCARGA DE PDF ORIGINAL S MUEBLERÍA',
            estado: '✅ OK',
            usuario: (verifiedUser.nombre || verifiedUser.correo) + ' (' + verifiedUser.correo + ')',
            sucursal: resolved.erpStore || verifiedUser.erpStore || '',
            referencia: refLabel,
            detalle: 'Archivo original "' + fileName + '" (' + Math.round(dlRes.pdfBytes.length / 1024) + ' KB · Reporte ' + repName + ').',
            analisis: 'PDF oficial obtenido en solo lectura desde sistema.smuebleria.com/VisorReportes.aspx sin alterar datos en S Mueblería.'
          });

          return {
            ok: true,
            pdfBase64: pdfBase64,
            mimeType: 'application/pdf',
            fileName: fileName,
            pdfDriveUrl: pdfDriveUrl,
            pdfDownloadUrl: pdfDownloadUrl,
            quoteId: String(resolved.quoteIdNum),
            folio: resolved.folio || ('ID-' + resolved.quoteIdNum),
            reportName: repName,
            byteLength: dlRes.pdfBytes.length
          };
        }

        if (dlRes && dlRes.needsLogin) {
          needFreshLogin = true;
          break;
        }
        if (dlRes && dlRes.error) {
          lastErrMsg = dlRes.error;
        }
      }

      if (needFreshLogin && authAttempt === 0) {
        sess = getValidErpSession_(true, cfg);
        continue;
      }
      break;
    }

    const failMsg = lastErrMsg || 'No fue posible obtener el PDF original desde VisorReportes.aspx en S Mueblería.';
    registrarEventoHistorial_(ss, {
      clasificacion: 'ALERTA TÉCNICA',
      modulo: 'AppsScript · VisorReportes S Mueblería',
      evento: 'AVISO AL DESCARGAR PDF ORIGINAL S MUEBLERÍA',
      estado: '⚠️ ALERTA',
      usuario: (verifiedUser.nombre || verifiedUser.correo) + ' (' + verifiedUser.correo + ')',
      sucursal: resolved.erpStore || verifiedUser.erpStore || '',
      referencia: (resolved.folio || '') + ' (ID ERP ' + resolved.quoteIdNum + ')',
      detalle: failMsg.slice(0, 260),
      analisis: 'Verificar disponibilidad de VisorReportes.aspx / Telerik.ReportViewer.axd en sistema.smuebleria.com.'
    });

    return {
      ok: false,
      error: 'S Mueblería no entregó el PDF original en este momento (' + failMsg + '). Intenta nuevamente en unos segundos.'
    };
  } catch (err) {
    const errTxt = String((err && err.message) || err || 'Error desconocido');
    registrarEventoHistorial_(ss, {
      clasificacion: 'FALLO DE CÓDIGO',
      modulo: 'AppsScript · handleInvDownloadErpQuotePdf_',
      evento: 'ERROR EN DESCARGA DE PDF ORIGINAL S MUEBLERÍA',
      estado: '❌ ERROR',
      usuario: (verifiedUser.nombre || verifiedUser.correo) + ' (' + verifiedUser.correo + ')',
      sucursal: verifiedUser.erpStore || '',
      referencia: String((body && (body.folio || body.quoteId)) || ''),
      detalle: errTxt.slice(0, 260),
      analisis: analizarCausaFalloCodigo_(err, 'AppsScript · handleInvDownloadErpQuotePdf_', 'inv_download_erp_quote_pdf')
    });
    return {
      ok: false,
      error: 'No se pudo descargar el PDF original de S Mueblería: ' + errTxt
    };
  }
}

/**
 * Organiza las 7 pestañas de cuentas de usuarios alineadas 100% con S Mueblería ERP:
 * - Cero hojas vacías o sin ocupar (PLAYA, COLOCIO, OUTLET COLOSIO, PTC, CASA CREATA, PROYECTOS y CUENTAS ADMINISTRATIVAS).
 * - Gerentes respetados tal cual en el sistema (100% descuento) y Asesores con 24% de descuento.
 * - Santiago Torres e Irvin Kevin Reyna Valdez como Administradores Generales (100% descuento, ven todas las tiendas y bodegas).
 * - TODOS los usuarios quedan con Contraseña Temporal activa (Columna F) y Contraseña personal vacía (Columna G).
 * - Columna H: Usuario / ID Asesor en S Mueblería · Columna I (al costado): Descuento (%).
 */
function organizarCuentasYDescuentosEnHojas(opts) {
  const silentUi = !!(opts && opts.silentUi);
  const ss = getAuthSpreadsheet_(getSpreadsheet_());

  // Si la hoja unificada CUENTAS ADMINISTRATIVAS (A:Z con tiendas V:Z) ya está activa, protegerla y evitar recrear las hojas de tiendas eliminadas
  const existingUnified = ss.getSheetByName(TAB_CUENTAS_ADMIN_);
  if (existingUnified && existingUnified.getLastRow() >= 3 && existingUnified.getMaxColumns() >= 26) {
    try { ensureCuentasAdministrativasSheet_(ss); } catch (eEnsureAdm) {}
    try { ensureInvitadosSheet_(ss); } catch (eEnsureInv) {}
    const totalUnifiedRows = Math.max(0, existingUnified.getLastRow() - 2);
    if (!silentUi) {
      try {
        SpreadsheetApp.getUi().alert(
          '¡Directorio unificado activo en CUENTAS ADMINISTRATIVAS!\n\n' +
          '• Todos los usuarios (' + totalUnifiedRows + ' filas) se administran ahora en la hoja CUENTAS ADMINISTRATIVAS con permisos en J:T y tiendas asignadas en V:Z (SI/NO).\n' +
          '• No se recrearon hojas individuales de sucursal ni se alteraron contraseñas.'
        );
      } catch (eUi) {}
    }
    return {
      ok: true,
      unified: true,
      sheetsConfigured: [TAB_CUENTAS_ADMIN_, 'INVITADOS'],
      totalAccounts: totalUnifiedRows,
      removedEmptySheets: []
    };
  }

  // 1) Conservar las contraseñas temporales actuales por correo (o pasar la existente a temporal) para que todos queden con Contraseña Temporal activa
  const existingTempByEmail = {};
  const existingAnyKeyByEmail = {};
  const candidateTabs = ['PLAYA', 'COLOCIO', 'COLOSIO', 'OUTLET COLOSIO', 'PTC', 'CASA CREATA', 'PROYECTOS', 'CUENTAS ADMINISTRATIVAS'];

  for (let t = 0; t < candidateTabs.length; t++) {
    const shOld = ss.getSheetByName(candidateTabs[t]);
    if (!shOld) continue;
    const hdrRow = findUserHeaderRow1Based_(shOld);
    if (hdrRow < 1 || shOld.getLastRow() <= hdrRow) continue;
    const startR = hdrRow + 1;
    const nRows = shOld.getLastRow() - hdrRow;
    const cols = Math.min(shOld.getMaxColumns(), 7);
    const oldVals = shOld.getRange(startR, 1, nRows, cols).getValues();
    for (let i = 0; i < oldVals.length; i++) {
      const em = String(oldVals[i][4] || '').trim().toLowerCase();
      if (!em || em.indexOf('@') === -1) continue;
      const tKey = cleanSheetKeyCell_(oldVals[i][5]);
      const dKey = cleanSheetKeyCell_(oldVals[i][6]);
      if (tKey && !existingTempByEmail[em]) {
        existingTempByEmail[em] = tKey;
      }
      if ((tKey || dKey) && !existingAnyKeyByEmail[em]) {
        existingAnyKeyByEmail[em] = tKey || dKey;
      }
    }
  }

  function resolveTempKeyForEmail_(email, fallbackSeed) {
    const em = String(email || '').trim().toLowerCase();
    if (existingTempByEmail[em]) return existingTempByEmail[em];
    if (existingAnyKeyByEmail[em]) {
      existingTempByEmail[em] = existingAnyKeyByEmail[em];
      return existingTempByEmail[em];
    }
    const generated = fallbackSeed || String(100000 + Math.floor(Math.random() * 900000));
    existingTempByEmail[em] = generated;
    return generated;
  }

  // 2) Definición exacta alineada a S Mueblería ERP (plantilla!AB2:AD76) + correos reales del equipo
  const sheetsPlan = [
    {
      tabName: 'PLAYA',
      headerSucursal: 'SUC. PLAYA',
      storeCell: 'CREATA LIVING PLAYA',
      accounts: [
        { nombre: 'JULIO DE LA CRUZ RAMON', puesto: 'Asesor Interiorista', correo: 'juliocruz@creatamuebles.com', erpLabel: 'JULIO DE LA CRUZ RAMON | CREATA LIVING PLAYA [ID: 39822]', descuento: '24%' },
        { nombre: 'ROCIO ESQUIVEL', puesto: 'Gerente de Tienda', correo: 'rocio.esquivel@creatamuebles.com', erpLabel: 'ROCIO ESQUIVEL | CREATA LIVING PLAYA [ID: 14472]', descuento: '100%' },
        { nombre: 'JUAN DZUL', puesto: 'Asesor Interiorista', correo: 'juan.dz@creatamuebles.com', erpLabel: 'JUAN DZUL | CREATA LIVING PLAYA [ID: 31421]', descuento: '24%' },
        { nombre: 'SAMANTHA SILVA', puesto: 'Asesor Interiorista', correo: 'samantha.silva@creatamuebles.com', erpLabel: 'Samantha Silva | CREATA LIVING PLAYA [ID: 42700]', descuento: '24%' }
      ]
    },
    {
      tabName: 'COLOCIO',
      headerSucursal: 'SUC. COLOSIO',
      storeCell: 'CREATA LIVING COLOSIO',
      accounts: [
        { nombre: 'JANINE MEDINA', puesto: 'Gerente de Tienda', correo: 'janine.medina@creatamuebles.com', erpLabel: 'JANINE  MEDINA | CREATA LIVING COLOSIO [ID: 21155]', descuento: '100%' },
        { nombre: 'FERNANDA PEREZ', puesto: 'Asesor Interiorista', correo: 'fernanda.perez@creatamuebles.com', erpLabel: 'FERNANDA PEREZ | CREATA LIVING COLOSIO [ID: 40872]', descuento: '24%' },
        { nombre: 'AGUASANTA MARIA MENDOZA BRITO', puesto: 'Asesor Interiorista', correo: 'aguasanta.mdz@creatamuebles.com', erpLabel: 'AGUASANTA MARIA MENDOZA BRITO | CREATA LIVING COLOSIO [ID: 32215]', descuento: '24%' },
        { nombre: 'JUAN CARLOS HERNANDEZ GARCIA', puesto: 'Asesor Interiorista', correo: 'juan.hdz@creatamuebles.com', erpLabel: 'JUAN CARLOS HERNANDEZ GARCIA | CREATA LIVING COLOSIO [ID: 39365]', descuento: '24%' },
        { nombre: 'MIGUEL ANGEL SANCHEZ MARTINEZ', puesto: 'Asesor Interiorista', correo: 'miguel.sanchez@creatamuebles.com', erpLabel: 'MIGUEL ANGEL SANCHEZ MARTINEZ | CREATA LIVING COLOSIO [ID: 39117]', descuento: '24%' },
        { nombre: 'JOHANA SOLARTE', puesto: 'Asesora de Ventas', correo: 'johanna.solarte@creatamuebles.com', erpLabel: 'JOHANA SOLARTE | CREATA LIVING COLOSIO [ID: 31715]', descuento: '24%' }
      ]
    },
    {
      tabName: 'OUTLET COLOSIO',
      headerSucursal: 'SUC. OUTLET COLOSIO',
      storeCell: 'OUTLET COLOSIO',
      accounts: [
        { nombre: 'JANINE MEDINA', puesto: 'Gerente de Tienda', correo: 'janine.medina@creatamuebles.com', erpLabel: 'JANINE MEDINA | OUTLET COLOSIO [ID: 42801]', descuento: '100%' },
        { nombre: 'FERNANDA PEREZ', puesto: 'Asesor Interiorista', correo: 'fernanda.perez@creatamuebles.com', erpLabel: 'FERNANDA PEREZ | OUTLET COLOSIO [ID: 40745]', descuento: '24%' },
        { nombre: 'AGUASANTA MARIA MENDOZA BRITO', puesto: 'Asesor Interiorista', correo: 'aguasanta.mdz@creatamuebles.com', erpLabel: 'AGUASANTA MARIA MENDOZA BRITO OUTLET | OUTLET COLOSIO [ID: 38932]', descuento: '24%' },
        { nombre: 'JUAN CARLOS HERNANDEZ GARCIA', puesto: 'Asesor Interiorista', correo: 'juan.hdz@creatamuebles.com', erpLabel: 'JUAN CARLOS HERNANDEZ GARCIA | OUTLET COLOSIO [ID: 40264]', descuento: '24%' },
        { nombre: 'MIGUEL ANGEL SANCHEZ MARTINEZ', puesto: 'Asesor Interiorista', correo: 'miguel.sanchez@creatamuebles.com', erpLabel: 'MIGUEL ANGEL SANCHEZ MARTINEZ | OUTLET COLOSIO [ID: 40873]', descuento: '24%' }
      ]
    },
    {
      tabName: 'PTC',
      headerSucursal: 'SUC. PTC',
      storeCell: 'CREATA PUERTO CANCUN',
      accounts: [
        { nombre: 'ALEXA PADILLA RIQUELME', puesto: 'Gerente de Tienda', correo: 'alexa.padilla@creatamuebles.com', erpLabel: 'ALEXA PADILLA RIQUELME | CREATA PUERTO CANCUN [ID: 37110]', descuento: '100%' },
        { nombre: 'DANIELA ARROYO', puesto: 'Asesora Interiorista', correo: 'daniela.arroyo@creatamuebles.com', erpLabel: 'DANIELA ARROYO | CREATA PUERTO CANCUN [ID: 24645]', descuento: '24%' },
        { nombre: 'ELOISA MONTOYA', puesto: 'Asesora Interiorista', correo: 'eloisa.montoya@creatamuebles.com', erpLabel: 'ELOISA MONTOYA | CREATA PUERTO CANCUN [ID: 36029]', descuento: '24%' },
        { nombre: 'PAULA DURAN DE LA MADRID', puesto: 'Asesora Interiorista', correo: 'paula.duran@creatamuebles.com', erpLabel: 'PAULA DURAN DE LA MADRID | CREATA PUERTO CANCUN [ID: 41013]', descuento: '24%' },
        { nombre: 'VIRIDIANA CASTELLANOS', puesto: 'Asesora de Ventas', correo: 'viridiana.castellanos@creatamuebles.com', erpLabel: 'VIRIDIANA CASTELLANOS | CREATA PUERTO CANCUN [ID: 14471]', descuento: '24%' }
      ]
    },
    {
      tabName: 'CASA CREATA',
      headerSucursal: 'SUC. CASA CREATA',
      storeCell: 'CASA CREATA BONAMPAK',
      accounts: [
        { nombre: 'GUADALUPE SANCHEZ', puesto: 'Gerente de Tienda', correo: 'lupita.sanchez@creatamuebles.com', erpLabel: 'GUADALUPE SANCHEZ | CASA CREATA BONAMPAK [ID: 14478]', descuento: '100%' },
        { nombre: 'JUAN PABLO GONZALEZ SALAS', puesto: 'Asesor Interiorista', correo: 'pablo.gonzalez@creatamuebles.com', erpLabel: 'JUAN PABLO GONZALEZ SALAS | CASA CREATA BONAMPAK [ID: 40613]', descuento: '24%' },
        { nombre: 'STEPHANIE PALOMA IBAREZ SALINAS', puesto: 'Asesor Interiorista', correo: 'paloma.ibarez@creatamuebles.com', erpLabel: 'STEPHANIE PALOMA IBAREZ SALINAS | CASA CREATA BONAMPAK [ID: 38330]', descuento: '24%' },
        { nombre: 'HEYSER GRETA ARANZA TAPIA MORALES', puesto: 'Asesor Interiorista', correo: 'greta.tapia@creatamuebles.com', erpLabel: 'HEYSER GRETA ARANZA TAPIA MORALES | CASA CREATA BONAMPAK [ID: 39852]', descuento: '24%' }
      ]
    },
    {
      tabName: 'PROYECTOS',
      headerSucursal: 'PROYECTOS',
      storeCell: 'PROYECTOS ANIPA INTERIOR',
      accounts: [
        { nombre: 'NELSON HERNANDEZ RODRIGUEZ', puesto: 'Gerente Comercial de Proyectos', correo: 'gte.proyectos@creatamuebles.com', erpLabel: 'NELSON HERNANDEZ RODRIGEZ | PROYECTOS ANIPA INTERIOR [ID: 38733]', descuento: '100%' },
        { nombre: 'ALEXA PADILLA RIQUELME', puesto: 'Gerente de Tienda', correo: 'alexa.padilla@creatamuebles.com', erpLabel: 'ALEXA PADILLA RIQUELME (PROYECTOS) | PROYECTOS ANIPA INTERIOR [ID: 37686]', descuento: '100%' },
        { nombre: 'JOHANA SOLARTE', puesto: 'Asesora de Ventas', correo: 'johanna.solarte@creatamuebles.com', erpLabel: 'JOHANA SOLARTE | PROYECTOS ANIPA INTERIOR [ID: 23073]', descuento: '24%' },
        { nombre: 'RENATO DANIEL CUEVAS CHAVEZ', puesto: 'Coordinador de Proyectos', correo: 'renato.cuevas@creatamuebles.com', erpLabel: 'RENATO DANIEL CUEVAS CHAVEZ PROYECTOS | PROYECTOS ANIPA INTERIOR [ID: 41808]', descuento: '24%' },
        { nombre: 'JULIAN AREVALO', puesto: 'Arquitecto Interiorista', correo: 'julian.arevalo@creatamuebles.com', erpLabel: 'Julian Arevalo | PROYECTOS ANIPA INTERIOR [ID: 42702]', descuento: '24%' },
        { nombre: 'MILDRED PACHECO SAAVEDRA', puesto: 'Interiorista Corporativa', correo: 'mildred.pacheco@creatamuebles.com', erpLabel: 'Mildred Saavedra | PROYECTOS ANIPA INTERIOR [ID: 42186]', descuento: '24%' },
        { nombre: 'DANIELA ARROYO', puesto: 'Asesora Interiorista', correo: 'daniela.arroyo@creatamuebles.com', erpLabel: 'DANIELA ARROYO PROYECTOS | PROYECTOS ANIPA INTERIOR [ID: 41810]', descuento: '24%' },
        { nombre: 'ELOISA MONTOYA', puesto: 'Asesora de Proyectos', correo: 'eloisa.montoya@creatamuebles.com', erpLabel: 'ELOISA MONTOYA (PROYECTOS) | PROYECTOS ANIPA INTERIOR [ID: 24648]', descuento: '24%' },
        { nombre: 'AGUASANTA MARIA MENDOZA BRITO', puesto: 'Asesora Interiorista', correo: 'aguasanta.mdz@creatamuebles.com', erpLabel: 'AGUASANTA MARIA MENDOZA BRITO PROYECTOS | PROYECTOS ANIPA INTERIOR [ID: 41807]', descuento: '24%' },
        { nombre: 'ANGEL DAVID IZQUIERDO SANCHEZ', puesto: 'Arquitecto Interiorista', correo: 'angel.izquierdo@creatamuebles.com', erpLabel: 'ANGEL DAVID IZQUIERDO SANCHEZ | CEDIS [ID: 41862]', descuento: '24%' }
      ]
    },
    {
      tabName: 'CUENTAS ADMINISTRATIVAS',
      headerSucursal: 'ADMINISTRACIÓN',
      storeCell: 'TODAS LAS TIENDAS / CEDIS',
      accounts: [
        { nombre: 'SANTIAGO TORRES', puesto: 'Administrador General', correo: 'santiago.torres@grupoanipa.com', erpLabel: 'SANTIAGO TORRES | ADMINISTRACION [ID: 24599]', descuento: '100%' },
        { nombre: 'IRVIN KEVIN REYNA VALDEZ', puesto: 'Administrador General', correo: 'kevin.reyna@grupoanipa.com', erpLabel: 'IRVIN KEVIN REYNA VALDEZ | CEDIS [ID: 38954]', descuento: '100%' }
      ]
    }
  ];

  let totalRowsWritten = 0;
  const activeTabNames = {};

  for (let p = 0; p < sheetsPlan.length; p++) {
    const plan = sheetsPlan[p];
    activeTabNames[plan.tabName.toUpperCase()] = true;
    let sh = ss.getSheetByName(plan.tabName);
    if (!sh) {
      sh = ss.insertSheet(plan.tabName, ss.getSheets().length);
    }
    if (sh.getMaxColumns() < 9) {
      sh.insertColumnsAfter(sh.getMaxColumns(), 9 - sh.getMaxColumns());
    }
    const neededRows = plan.accounts.length + 5;
    if (sh.getMaxRows() < neededRows) {
      sh.insertRowsAfter(sh.getMaxRows(), neededRows - sh.getMaxRows());
    }

    sh.getRange(1, 1, sh.getMaxRows(), Math.min(sh.getMaxColumns(), 12)).clearContent();

    const headerRowVals = [[
      '',
      plan.headerSucursal,
      'Nombre',
      'Puesto',
      'Correo',
      'Contraseña Temporal',
      'Contraseña',
      'Usuario / ID Asesor',
      'Descuento'
    ]];
    sh.getRange(2, 1, 1, 9).setValues(headerRowVals);
    sh.getRange(2, 2, 1, 8)
      .setBackground('#252C32')
      .setFontColor('#FFFFFF')
      .setFontWeight('bold')
      .setHorizontalAlignment('center');
    sh.getRange(2, 8, 1, 2).setBackground('#A38251');

    const dataRows = plan.accounts.map((acc) => {
      const tempK = resolveTempKeyForEmail_(acc.correo);
      return [
        '',
        plan.storeCell,
        acc.nombre,
        acc.puesto,
        acc.correo.toLowerCase(),
        tempK,
        '',
        acc.erpLabel,
        acc.descuento
      ];
    });

    if (dataRows.length > 0) {
      sh.getRange(3, 6, dataRows.length, 2).setNumberFormat('@');
      sh.getRange(3, 1, dataRows.length, 8).setValues(dataRows.map((r) => r.slice(0, 8)));
      for (let dIdx = 0; dIdx < dataRows.length; dIdx++) {
        const discSpec = String(dataRows[dIdx][8] || '');
        const cellDisc = sh.getRange(3 + dIdx, 9);
        if (discSpec === '24%' || /^=IF/i.test(discSpec)) {
          cellDisc.setFormula('=IF(TODAY()<=DATE(2026,11,30),"30%","24%")');
        } else {
          cellDisc.setNumberFormat('@').setValue(discSpec);
        }
      }
      sh.getRange(3, 6, dataRows.length, 2).setHorizontalAlignment('center');
      sh.getRange(3, 9, dataRows.length, 1).setHorizontalAlignment('center').setFontWeight('bold');
      totalRowsWritten += dataRows.length;
    }

    sh.setColumnWidth(1, 28);
    sh.setColumnWidth(2, 185);
    sh.setColumnWidth(3, 235);
    sh.setColumnWidth(4, 195);
    sh.setColumnWidth(5, 245);
    sh.setColumnWidth(6, 155);
    sh.setColumnWidth(7, 135);
    sh.setColumnWidth(8, 340);
    sh.setColumnWidth(9, 105);
    sh.setFrozenRows(2);
  }

  // 3) Asegurar que la hoja INVITADOS exista intacta y eliminar únicamente hojas por defecto 100% vacías (ej. "Hoja 2"), protegiendo todas las pestañas de otros proyectos y fórmulas
  try { ensureInvitadosSheet_(ss); } catch (eInvEnsure) {}
  const protectedTabs = {
    '1': true,
    'INVITADOS': true,
    'CATALOGO_PRODUCTOS': true,
    'PIEZAS_MODULOS': true,
    'SALAS_MODULARES': true,
    'MUEBLES_INDIVIDUALES': true,
    'INVENTARIO_EN_VIVO': true,
    'INF. PRODUC': true,
    'PLANTILLA': true,
    'COTIZACIONES_EN_VIVO': true,
    'HISTORIAL': true,
    'DEMANDA_SIN_STOCK': true,
    'SUGERENCIAS_DE_COMPRA': true,
    'FOTOS NUEVAS CARGADO': true,
    'FOTOS NUEVAS': true,
    '_CREATA_CONFIG': true
  };
  eliminarPestanaTopBuscadosSiExiste_(ss);
  const removedEmptySheets = [];
  const allSheets = ss.getSheets();
  for (let s = 0; s < allSheets.length; s++) {
    const shItem = allSheets[s];
    const sName = shItem.getName();
    const sUp = sName.trim().toUpperCase();
    if (activeTabNames[sUp] || protectedTabs[sUp]) continue;
    const isDefaultBlankSheet = /^(HOJA|SHEET)\s*\d+$/i.test(sName.trim()) && shItem.getLastRow() === 0 && shItem.getLastColumn() === 0;
    const isDuplicateEmptyColosio = (sUp === 'COLOSIO' && activeTabNames['COLOCIO'] && shItem.getLastRow() === 0 && shItem.getLastColumn() === 0);
    if ((isDefaultBlankSheet || isDuplicateEmptyColosio) && ss.getSheets().length > 1) {
      removedEmptySheets.push(sName);
      ss.deleteSheet(shItem);
    }
  }

  SpreadsheetApp.flush();

  if (!silentUi) {
    try {
      SpreadsheetApp.getUi().alert(
        '¡Cuentas, Contraseñas Temporales y Descuentos listos!\n\n' +
        '• 7 hojas ocupadas (0 hojas vacías): PLAYA, COLOCIO, OUTLET COLOSIO, PTC, CASA CREATA, PROYECTOS y CUENTAS ADMINISTRATIVAS.\n' +
        '• Total de registros configurados: ' + totalRowsWritten + '\n' +
        '• Administradores Generales (ver todo · 100%): Santiago Torres e Irvin Kevin Reyna Valdez.\n' +
        '• Todos los usuarios quedaron con Contraseña Temporal activa (Columna F) y Contraseña personal vacía (Columna G).\n' +
        '• Columna H: Usuario / ID Asesor S Mueblería · Columna I: Descuento (24% Asesores / 100% Gerentes y Administradores).'
      );
    } catch (e) {}
  }

  return {
    ok: true,
    sheetsConfigured: sheetsPlan.map((x) => x.tabName),
    totalAccounts: totalRowsWritten,
    removedEmptySheets: removedEmptySheets
  };
}

function handleInvPlantillaStatus_() {
  const ss = getSpreadsheet_();
  const sh = ss.getSheetByName('plantilla');
  if (!sh) {
    return { ok: false, error: 'Hoja plantilla no encontrada.' };
  }
  const topVals = sh.getRange('A5:M11').getDisplayValues();
  const totVals = sh.getRange('F30:H33').getDisplayValues();
  return {
    ok: true,
    erpStore: topVals[0][2] || '',
    erpAdvisor: topVals[1][2] || '',
    erpUserId: topVals[1][6] || '',
    actionState: topVals[0][10] || '',
    erpStatus: topVals[1][10] || '',
    quoteId: topVals[2][10] || '',
    folio: topVals[2][12] || '',
    subjectRef: topVals[3][10] || '',
    lastSync: topVals[4][10] || '',
    extraDiscount: totVals[0][2] || '',
    subtotal: totVals[1][2] || '',
    iva: totVals[2][2] || '',
    total: totVals[3][2] || ''
  };
}
