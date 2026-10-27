function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function getBaseUrl() {
  return ScriptApp.getService().getUrl();
}

/**
 * ✅ ACL: valida mail del usuario (perfil Google) y lo busca en BQ
 */
const ACL_APP_ID = "interna"; // 👈 este valor cambia por proyecto/script

function userHasAccess_() {
  const projectId = "selnet-476815";

  // Mail real del usuario logueado (solo funciona bien si el deploy está correcto)
  const mail = (Session.getActiveUser().getEmail() || "").toLowerCase().trim();

  // Si no hay mail (incógnito / perfil sin cuenta / deploy mal configurado)
  if (!mail) {
    return { ok: false, reason: "NO_EMAIL", mail: "" };
  }

  // ✅ Tabla real: mail + categoria
  // ✅ Permitimos: categoria exacta = ACL_APP_ID o '*' (comodín)
  // ✅ Opcional: si categoria trae "gold,stock", también lo aceptamos.
  const query = `
    SELECT 1
    FROM \`${projectId}.pagina.accesos\`
    WHERE LOWER(mail) = @mail
      AND (
        LOWER(categoria) = LOWER(@categoria)
        OR categoria = '*'
        OR REGEXP_CONTAINS(LOWER(categoria), r'(^|,)\\s*' || LOWER(@categoria) || r'\\s*(,|$)')
      )
    LIMIT 1
  `;

  const request = {
    query,
    useLegacySql: false,
    location: "us-central1",
    parameterMode: "NAMED",
    queryParameters: [
      {
        name: "mail",
        parameterType: { type: "STRING" },
        parameterValue: { value: mail } // ✅ acá iba "mail" y te rompía
      },
      {
        name: "categoria",
        parameterType: { type: "STRING" },
        parameterValue: { value: ACL_APP_ID }
      }
    ]
  };

  const job = BigQuery.Jobs.query(request, projectId);
  const ok = !!(job.rows && job.rows.length);

  return ok
    ? { ok: true, mail, categoria: ACL_APP_ID }
    : { ok: false, reason: "NOT_ALLOWED", mail, categoria: ACL_APP_ID };
}

/**
 * ✅ HTML denegado / login info
 */
function ACL_deniedHtml_(access, e) {
  const t = HtmlService.createTemplateFromFile("login");
  t.reason = access.reason || "";
  t.mail = access.mail || "";
  t.categoria = access.categoria || "";
  t.baseUrl = getBaseUrl();
  t.next = (e?.parameter?.page || "home").toLowerCase();

  return t.evaluate().setTitle("Acceso requerido");
}

function doGet(e) {
  // ✅ 1) Control de acceso primero
  const access = userHasAccess_();
  if (!access.ok) return ACL_deniedHtml_(access, e);

  // ✅ 2) Render normal
  const page = (e?.parameter?.page || "home").toLowerCase();

  const allowedPages = [
    "home",
    "digifort",
    "ezviz",
    "hikmicro",
    "hikvision",
    "outlet",
    "ranger",
    "seagate",
    "takex",
    "ultracell",
    "vivotek",
    "vortex"
  ];

  const pageToLoad = allowedPages.includes(page) ? page : "home";

  const t = HtmlService.createTemplateFromFile("layout");
  t.pageContent = pageToLoad;
  t.currentPage = pageToLoad;
  t.baseUrl = getBaseUrl();

  // ✅ información de actualización y usuario
  t.userEmail = access.mail;
  t.userCategoria = access.categoria; 
  t.lastUpdated = getTableLastUpdated_();

  return t.evaluate()
    .setTitle("Lista de Precios Selnet")
}

function getHomeCatalogFromBQ() {
  const projectId = "selnet-476815";

  // BQ lee directo de la tabla precalculada
  const query = `
    SELECT *
    FROM \`${projectId}.pagina.gold_home\`
    ORDER BY marca, modelo
  `;

  const request = {
    query: query,
    useLegacySql: false,
    location: "us-central1"
  };

  const job = BigQuery.Jobs.query(request, projectId);

  const rows = (job.rows || []).map(r => {
    const f = r.f || [];
    return {
      sap:          f[0]?.v ?? "",
      cod_bejerman: (f[1]?.v ?? "").toString().toUpperCase(),
      modelo:       f[2]?.v ?? "",
      descripcion:  f[3]?.v ?? "",
      marca:        f[4]?.v ?? "",
      categoria:    f[5]?.v ?? "",
      subcategoria: f[6]?.v ?? "",
      diamond:      f[7]?.v ?? "",
      black:        f[8]?.v ?? "",
      platinum:     f[9]?.v ?? "",
      ruby:         f[10]?.v ?? "",
      gold_gremio:  f[11]?.v ?? "",
      pvp:          f[12]?.v ?? "",
      epp:          f[13]?.v ?? "",
      iva:          f[14]?.v ?? "",
      oferta:       f[15]?.v ?? "",
      es_oferta:    f[16]?.v ?? "",
      disponible:   f[17]?.v ?? "",
      en_transito:  f[18]?.v ?? ""
    };
  });

  return rows;
}

function getProductosNuevosFromBQ() {
  const projectId = "selnet-476815";

  // BQ lee directo de la tabla precalculada
  const query = `
    SELECT *
    FROM \`${projectId}.pagina.gold_home_nuevos\`
    ORDER BY marca, modelo, codigo_producto_nuevo
  `;


  const request = {
    query,
    useLegacySql: false,
    location: "us-central1"
  };

  const job = BigQuery.Jobs.query(request, projectId);

  const rows = (job.rows || []).map(r => {
    const f = r.f || [];
    return {
      marca:        f[0]?.v ?? "",
      sap:          f[1]?.v ?? "",
      cod_bejerman: f[2]?.v ?? "",
      modelo:       f[3]?.v ?? "",
      descripcion:  f[4]?.v ?? "",
      categoria:    f[5]?.v ?? "",
      subcategoria: f[6]?.v ?? "",
      diamond:      f[7]?.v ?? "",
      black:        f[8]?.v ?? "",
      platinum:     f[9]?.v ?? "",
      ruby:         f[10]?.v ?? "",
      gold_gremio:  f[11]?.v ?? "",
      pvp:          f[12]?.v ?? "",
      epp:          f[13]?.v ?? "",
      iva:          f[14]?.v ?? "",
      oferta:       f[15]?.v ?? "",
      es_oferta:    f[16]?.v ?? "",
      disponible:   f[17]?.v ?? "",
      en_transito:  f[18]?.v ?? ""
    };
  });

  return rows;
}


// PAGINA DE DIGIFORT ----------------------------------
function getDigifortFromBQ() {
  const projectId = "selnet-476815";

  // BQ lee directo de la tabla precalculada
  const query = `
    SELECT *
    FROM \`${projectId}.pagina.gold_digifort\`
    ORDER BY modelo
  `;

  const request = { query, useLegacySql: false };

  let job = BigQuery.Jobs.query(request, projectId);

  while (!job.jobComplete) {
    Utilities.sleep(300);
    job = BigQuery.Jobs.getQueryResults(projectId, job.jobReference.jobId);
  }

  // Paginación de resultados del job
  const jobId = job.jobReference.jobId;

  let rows = (job.rows || []).slice();
  let pageToken = job.pageToken;

  while (pageToken) {
    const resp = BigQuery.Jobs.getQueryResults(projectId, jobId, { pageToken });
    rows = rows.concat(resp.rows || []);
    pageToken = resp.pageToken;
  }

  return rows.map(r => ({
    modelo: r.f[0]?.v ?? "",
    descripcion: r.f[1]?.v ?? "",
    categoria: r.f[2]?.v ?? "",
    subcategoria: r.f[3]?.v ?? "",
    gremio: r.f[4]?.v ?? "",
    usuario_final: r.f[5]?.v ?? "",
    iva: r.f[6]?.v ?? "",
    unidades: r.f[7]?.v ?? ""
  }));
}


// PAGINA DE EZVIZ ----------------------------------
function getEzvizFromBQ() {
  const projectId = "selnet-476815";

  // BQ lee directo de la tabla precalculada
  const query = `
    SELECT *
    FROM \`${projectId}.pagina.gold_ezviz\`
    ORDER BY modelo
  `;

  const request = { query, useLegacySql: false };

  let job = BigQuery.Jobs.query(request, projectId);

  while (!job.jobComplete) {
    Utilities.sleep(300);
    job = BigQuery.Jobs.getQueryResults(projectId, job.jobReference.jobId);
  }

  // Paginación del job (BigQuery devuelve por partes a veces)
  const jobId = job.jobReference.jobId;

  let rows = (job.rows || []).slice();
  let pageToken = job.pageToken;

  while (pageToken) {
    const resp = BigQuery.Jobs.getQueryResults(projectId, jobId, { pageToken });
    rows = rows.concat(resp.rows || []);
    pageToken = resp.pageToken;
  }

  return rows.map(r => ({
    hik_code: r.f[0]?.v ?? "",
    cod_bejerman: r.f[1]?.v ?? "",
    nomenclatura_oficial: r.f[2]?.v ?? "",
    modelo: r.f[3]?.v ?? "",
    descripcion: r.f[4]?.v ?? "",
    categoria: r.f[5]?.v ?? "",
    subcategoria: r.f[6]?.v ?? "",
    gremio: r.f[7]?.v ?? "",
    epp: r.f[8]?.v ?? "",
    disponible: r.f[9]?.v ?? "",
    en_transito: r.f[10]?.v ?? "",
    oferta: r.f[11]?.v ?? "",
    es_oferta: r.f[12]?.v ?? ""
  }));
}

// PAGINA DE HIKMICRO ----------------------------------
function getHikmicroFromBQ() {
  const projectId = "selnet-476815";

  // BQ lee directo de la tabla precalculada
  const query = `
    SELECT *
    FROM \`${projectId}.pagina.gold_hikmicro\`
    ORDER BY modelo
  `;

  const request = { query, useLegacySql: false };

  let job = BigQuery.Jobs.query(request, projectId);

  while (!job.jobComplete) {
    Utilities.sleep(300);
    job = BigQuery.Jobs.getQueryResults(projectId, job.jobReference.jobId);
  }

  // Paginación de resultados del job
  const jobId = job.jobReference.jobId;

  let rows = (job.rows || []).slice();
  let pageToken = job.pageToken;

  while (pageToken) {
    const resp = BigQuery.Jobs.getQueryResults(projectId, jobId, { pageToken });
    rows = rows.concat(resp.rows || []);
    pageToken = resp.pageToken;
  }

  return rows.map(r => ({
    hik_code: r.f[0]?.v ?? "",
    cod_bejerman: r.f[1]?.v ?? "",
    modelo: r.f[2]?.v ?? "",
    descripcion: r.f[3]?.v ?? "",
    categoria: r.f[4]?.v ?? "",
    subcategoria: r.f[5]?.v ?? ""
  }));
}

// PAGINA DE HIKVISION ----------------------------------
function getHikvisionFromBQ() {
  const projectId = "selnet-476815";

  // BQ lee directo de la tabla precalculada
  const query = `
    SELECT *
    FROM \`${projectId}.pagina.gold_hikvision\`
    ORDER BY modelo
  `;

  const request = { query, useLegacySql: false };
  let job = BigQuery.Jobs.query(request, projectId);

  while (!job.jobComplete) {
    Utilities.sleep(300);
    job = BigQuery.Jobs.getQueryResults(projectId, job.jobReference.jobId);
  }

  // Paginación del job (por si viene por partes)
  const jobId = job.jobReference.jobId;
  let rows = (job.rows || []).slice();
  let pageToken = job.pageToken;

  while (pageToken) {
    const resp = BigQuery.Jobs.getQueryResults(projectId, jobId, { pageToken });
    rows = rows.concat(resp.rows || []);
    pageToken = resp.pageToken;
  }

    // Mapeo a objetos
    return rows.map(r => ({
      hik_code: r.f[0]?.v ?? "",
      cod_bejerman: r.f[1]?.v ?? "",
      modelo: r.f[2]?.v ?? "",
      descripcion: r.f[3]?.v ?? "",

      categoria: r.f[4]?.v ?? "",
      subcategoria: r.f[5]?.v ?? "",

      hdn_diamond_titanium_usd: r.f[6]?.v ?? "",
      hdnhsp_blackusd: r.f[7]?.v ?? "",
      hdnhsp_platinum_usd: r.f[8]?.v ?? "",
      hsphsi_ruby_usd: r.f[9]?.v ?? "",
      gold_gremio: r.f[10]?.v ?? "",
      map_web_usd_iva: r.f[11]?.v ?? "",
      disponible: r.f[12]?.v ?? "",
      en_transito: r.f[13]?.v ?? "",
      oferta: r.f[14]?.v ?? "",
      es_oferta: r.f[15]?.v ?? ""
    }));
  }

// PAGINA DE OUTLET ----------------------------------
function getOutletFromBQ() {
  const projectId = "selnet-476815";

  // BQ lee directo de la tabla precalculada
  const query = `
    SELECT *
    FROM \`${projectId}.pagina.gold_outlet\`
    ORDER BY modelo
  `;

  const request = { query, useLegacySql: false };

  let job = BigQuery.Jobs.query(request, projectId);

  while (!job.jobComplete) {
    Utilities.sleep(300);
    job = BigQuery.Jobs.getQueryResults(projectId, job.jobReference.jobId);
  }

  // Paginación de resultados del job
  const jobId = job.jobReference.jobId;

  let rows = (job.rows || []).slice();
  let pageToken = job.pageToken;

  while (pageToken) {
    const resp = BigQuery.Jobs.getQueryResults(projectId, jobId, { pageToken });
    rows = rows.concat(resp.rows || []);
    pageToken = resp.pageToken;
  }

  return rows.map(r => ({
    hik_code: r.f[0]?.v ?? "",
    cod_bejerman: r.f[1]?.v ?? "",
    modelo: r.f[2]?.v ?? "",
    fabricante: r.f[3]?.v ?? "",
    descripcion: r.f[4]?.v ?? "",
    categoria: r.f[5]?.v ?? "",
    subcategoria: r.f[6]?.v ?? "",
    gremio: r.f[7]?.v ?? "",
    epp: r.f[8]?.v ?? "",
    iva: r.f[9]?.v ?? "",
    observacion: r.f[10]?.v ?? "",
    oferta: r.f[11]?.v ?? "",
    es_oferta: r.f[12]?.v ?? ""
  }));
}

// PAGINA DE RANGER ----------------------------------
function getRangerFromBQ() {
  const projectId = "selnet-476815";

  // BQ lee directo de la tabla precalculada
  const query = `
    SELECT *
    FROM \`${projectId}.pagina.gold_ranger\`
    ORDER BY modelo
  `;

  const request = { query, useLegacySql: false };

  let job = BigQuery.Jobs.query(request, projectId);

  while (!job.jobComplete) {
    Utilities.sleep(300);
    job = BigQuery.Jobs.getQueryResults(projectId, job.jobReference.jobId);
  }

  // Paginación del job
  const jobId = job.jobReference.jobId;

  let rows = (job.rows || []).slice();
  let pageToken = job.pageToken;

  while (pageToken) {
    const resp = BigQuery.Jobs.getQueryResults(projectId, jobId, { pageToken });
    rows = rows.concat(resp.rows || []);
    pageToken = resp.pageToken;
  }

  return rows.map(r => ({
    cod_bejerman: r.f[0]?.v ?? "",
    modelo: r.f[1]?.v ?? "",
    descripcion: r.f[2]?.v ?? "",
    categoria: r.f[3]?.v ?? "",
    subcategoria: r.f[4]?.v ?? "",
    gremio: r.f[5]?.v ?? "",
    cliente_final: r.f[6]?.v ?? "",
    iva: r.f[7]?.v ?? "",
    oferta: r.f[8]?.v ?? "",
    es_oferta: r.f[9]?.v ?? ""
  }));
}

// PAGINA DE SEAGATE ----------------------------------
function getSeagateFromBQ() {
  const projectId = "selnet-476815";

  // BQ lee directo de la tabla precalculada
  const query = `
    SELECT *
    FROM \`${projectId}.pagina.gold_seagate\`
    ORDER BY modelo
  `;

  const request = { query, useLegacySql: false };
  let job = BigQuery.Jobs.query(request, projectId);

  while (!job.jobComplete) {
    Utilities.sleep(300);
    job = BigQuery.Jobs.getQueryResults(projectId, job.jobReference.jobId);
  }

  const jobId = job.jobReference.jobId;
  let rows = (job.rows || []).slice();
  let pageToken = job.pageToken;

  while (pageToken) {
    const resp = BigQuery.Jobs.getQueryResults(projectId, jobId, { pageToken });
    rows = rows.concat(resp.rows || []);
    pageToken = resp.pageToken;
  }

  return rows.map(r => ({
    hik_code: r.f[0]?.v ?? "",
    cod_bejerman: (r.f[1]?.v ?? "").toString().toUpperCase(),
    modelo: r.f[2]?.v ?? "",
    descripcion: r.f[3]?.v ?? "",
    categoria: r.f[4]?.v ?? "",
    subcategoria: r.f[5]?.v ?? "",
    gremio: r.f[6]?.v ?? "",
    iva: r.f[7]?.v ?? "",
    pvp: r.f[8]?.v ?? "", // Mapeo de PVP
    dpp_platinum: r.f[9]?.v ?? "", // Mapeo de DPP
    oferta: r.f[10]?.v ?? "",
    es_oferta: r.f[11]?.v ?? ""
  }));
}


// PAGINA DE TAKEX ----------------------------------
function getTakexFromBQ() {
  const projectId = "selnet-476815";

  // BQ lee directo de la tabla precalculada
  const query = `
    SELECT *
    FROM \`${projectId}.pagina.gold_takex\`
    ORDER BY modelo
  `;

  const request = { query, useLegacySql: false };

  let job = BigQuery.Jobs.query(request, projectId);

  while (!job.jobComplete) {
    Utilities.sleep(300);
    job = BigQuery.Jobs.getQueryResults(projectId, job.jobReference.jobId);
  }

  // Paginación del job
  const jobId = job.jobReference.jobId;

  let rows = (job.rows || []).slice();
  let pageToken = job.pageToken;

  while (pageToken) {
    const resp = BigQuery.Jobs.getQueryResults(projectId, jobId, { pageToken });
    rows = rows.concat(resp.rows || []);
    pageToken = resp.pageToken;
  }

  return rows.map(r => ({
    modelo: r.f[0]?.v ?? "",
    descripcion: r.f[1]?.v ?? "",
    categoria: r.f[2]?.v ?? "",
    subcategoria: r.f[3]?.v ?? "",
    gremio: r.f[4]?.v ?? "",
    iva: r.f[5]?.v ?? "",
    oferta: r.f[6]?.v ?? "",
    es_oferta: r.f[7]?.v ?? ""
  }));
}

// PAGINA DE ULTRACELL ----------------------------------
function getUltracellFromBQ() {
  const projectId = "selnet-476815";

  // BQ lee directo de la tabla precalculada
  const query = `
    SELECT *
    FROM \`${projectId}.pagina.gold_ultracell\`
    ORDER BY modelo
  `;

  const request = { query, useLegacySql: false };

  let job = BigQuery.Jobs.query(request, projectId);

  while (!job.jobComplete) {
    Utilities.sleep(300);
    job = BigQuery.Jobs.getQueryResults(projectId, job.jobReference.jobId);
  }

  // Paginación del job
  const jobId = job.jobReference.jobId;

  let rows = (job.rows || []).slice();
  let pageToken = job.pageToken;

  while (pageToken) {
    const resp = BigQuery.Jobs.getQueryResults(projectId, jobId, { pageToken });
    rows = rows.concat(resp.rows || []);
    pageToken = resp.pageToken;
  }

  return rows.map(r => ({
    modelo: r.f[0]?.v ?? "",
    descripcion: r.f[1]?.v ?? "",
    categoria: r.f[2]?.v ?? "",
    subcategoria: r.f[3]?.v ?? "",
    gremio: r.f[4]?.v ?? "",
    iva: r.f[5]?.v ?? "",
    unidades: r.f[6]?.v ?? "",
    oferta: r.f[7]?.v ?? "",
    es_oferta: r.f[8]?.v ?? ""
  }));
}

// PAGINA DE VIVOTEK ----------------------------------
function getVivotekFromBQ() {
  const projectId = "selnet-476815";

  // Ahora BQ lee directo de la tabla precalculada
  const query = `
    SELECT *
    FROM \`${projectId}.pagina.gold_vivotek\`
    ORDER BY modelo
  `;

  const request = { query, useLegacySql: false };

  let job = BigQuery.Jobs.query(request, projectId);

  while (!job.jobComplete) {
    Utilities.sleep(300);
    job = BigQuery.Jobs.getQueryResults(projectId, job.jobReference.jobId);
  }

  // Paginación del job
  const jobId = job.jobReference.jobId;

  let rows = (job.rows || []).slice();
  let pageToken = job.pageToken;

  while (pageToken) {
    const resp = BigQuery.Jobs.getQueryResults(projectId, jobId, { pageToken });
    rows = rows.concat(resp.rows || []);
    pageToken = resp.pageToken;
  }

  return rows.map(r => ({
    cod_bej: r.f[0]?.v ?? "",
    modelo: r.f[1]?.v ?? "",
    descripcion: r.f[2]?.v ?? "",
    categoria: r.f[3]?.v ?? "",
    subcategoria: r.f[4]?.v ?? "",
    gremio: r.f[5]?.v ?? "",
    cliente_final: r.f[6]?.v ?? "",
    disponible: r.f[7]?.v ?? "",
    en_transito: r.f[8]?.v ?? "",
    oferta: r.f[9]?.v ?? "",
    es_oferta: r.f[10]?.v ?? ""
  }));
}

// PAGINA DE VORTEX ----------------------------------
function getVortexFromBQ() {
  const projectId = "selnet-476815";

  // Ahora BQ solo lee la tabla ya calculada "gold_vortex"
  const query = `
    SELECT *
    FROM \`${projectId}.pagina.gold_vortex\`
    ORDER BY modelo
  `;

  const request = { query, useLegacySql: false };

  let job = BigQuery.Jobs.query(request, projectId);

  while (!job.jobComplete) {
    Utilities.sleep(300);
    job = BigQuery.Jobs.getQueryResults(projectId, job.jobReference.jobId);
  }

  // Paginación del job
  const jobId = job.jobReference.jobId;

  let rows = (job.rows || []).slice();
  let pageToken = job.pageToken;

  while (pageToken) {
    const resp = BigQuery.Jobs.getQueryResults(projectId, jobId, { pageToken });
    rows = rows.concat(resp.rows || []);
    pageToken = resp.pageToken;
  }

  return rows.map(r => ({
    cod_bej: r.f[0]?.v ?? "",
    modelo: r.f[1]?.v ?? "",
    descripcion: r.f[2]?.v ?? "",
    categoria: r.f[3]?.v ?? "",
    subcategoria: r.f[4]?.v ?? "",
    gremio: r.f[5]?.v ?? "",
    cliente_final: r.f[6]?.v ?? "",
    iva: r.f[7]?.v ?? ""
  }));
}

function getTableLastUpdated_() {
  const projectId = "selnet-476815";
  const datasetId = "pagina";
  const tableId = "stock_ultima_actualizacion";
  try {
    const table = BigQuery.Tables.get(projectId, datasetId, tableId);
    const ms = parseInt(table.lastModifiedTime);
    const date = new Date(ms);
    // Formato sugerido: dd/MM HH:mm
    return Utilities.formatDate(date, "GMT-3", "dd/MM/yyyy HH:mm");
  } catch (e) {
    return "---";
  }
}


