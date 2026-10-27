function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function getBaseUrl() {
  return ScriptApp.getService().getUrl();
}

/**
 * ✅ ACL: valida mail del usuario (perfil Google) y lo busca en BQ
 */
const ACL_APP_ID = "ruby"; // 👈 este valor cambia por proyecto/script

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
    .setTitle("Lista de Precios - Ruby")
}

function getHomeCatalogFromBQ() {
  const projectId = "selnet-476815";

    const query = `
    -- HOME: catálogo unificado (pagina.*) + precios/gremio
    WITH
      -- =========================
      -- HIK: base desde pagina.hikvision
      -- =========================
      hik AS (
        SELECT
          CAST(hik_code AS STRING) AS hik_code,
          CAST(cod_bejerman AS STRING) AS cod_bejerman,
          CAST(modelo AS STRING) AS modelo,
          CAST(descripcion AS STRING) AS descripcion,
          CAST(marca AS STRING) AS marca,
          CAST(categoria AS STRING) AS categoria,
          CAST(subcategoria AS STRING) AS subcategoria,
          -- clave para mps (solo números)
          REGEXP_REPLACE(CAST(hik_code AS STRING), r'[^0-9]', '') AS key_hik_mps,
          -- clave normalizada por bejerman para ofertas/stock
          REGEXP_REPLACE(LOWER(CAST(cod_bejerman AS STRING)), r'[^0-9a-z]', '') AS key_bej
        FROM \`${projectId}.pagina.hikvision\`
      ),

      -- =========================
      -- MPS nueva (18/09/26)
      -- =========================
      mps_sep AS (
        SELECT
          REGEXP_REPLACE(CAST(sap_code AS STRING), r'[^0-9]', '') AS key_mps,
          ROUND(SAFE_CAST(diamond AS FLOAT64), 2) AS hdn_diamond_titanium_usd,
          ROUND(SAFE_CAST(black AS FLOAT64), 2)   AS hdnhsp_blackusd,
          ROUND(SAFE_CAST(platinum AS FLOAT64), 2) AS hdnhsp_platinum_usd,
          ROUND(SAFE_CAST(ruby AS FLOAT64), 2)    AS hsphsi_ruby_usd,
          ROUND(SAFE_CAST(gold_gremio AS FLOAT64), 2) AS gold_gremio,
          ROUND(SAFE_CAST(map_web_usd_sin_iva AS FLOAT64), 2) AS map_web_usd_iva
        FROM \`${projectId}.pagina.mps_18_09_26\`
      ),

      mps18 AS (
        SELECT
          REGEXP_REPLACE(CAST(sap AS STRING), r'[^0-9]', '') AS key_mps,
          ROUND(SAFE_CAST(hdn_diamond_titanium_usd AS FLOAT64), 2) AS hdn_diamond_titanium_usd,
          ROUND(SAFE_CAST(hdnhsp_blackusd AS FLOAT64), 2) AS hdnhsp_blackusd,
          ROUND(SAFE_CAST(hdnhsp_platinum_usd AS FLOAT64), 2) AS hdnhsp_platinum_usd,
          ROUND(SAFE_CAST(hsphsi_ruby_usd AS FLOAT64), 2) AS hsphsi_ruby_usd,
          ROUND(SAFE_CAST(gold_gremio AS FLOAT64), 2) AS gold_gremio,
          ROUND(SAFE_CAST(pvp AS FLOAT64), 2) AS pvp_list
        FROM \`${projectId}.pagina.mps_18_05_26\`
      ),

      -- =========================
      -- MPS nueva (21/01/26)
      -- =========================
      mps21 AS (
        SELECT
          REGEXP_REPLACE(CAST(sap AS STRING), r'[^0-9]', '') AS key_mps,
          ROUND(SAFE_CAST(hdn_diamond_titanium_usd AS FLOAT64), 2) AS hdn_diamond_titanium_usd,
          ROUND(SAFE_CAST(hdnhsp_blackusd AS FLOAT64), 2)          AS hdnhsp_blackusd,
          ROUND(SAFE_CAST(hdnhsp_platinum_usd AS FLOAT64), 2)      AS hdnhsp_platinum_usd,
          ROUND(SAFE_CAST(hsphsi_ruby_usd AS FLOAT64), 2)          AS hsphsi_ruby_usd,
          ROUND(SAFE_CAST(gold_gremio AS FLOAT64), 2)              AS gold_gremio,
          ROUND(SAFE_CAST(map_web_usd_iva AS FLOAT64), 2)          AS map_web_usd_iva
        FROM \`${projectId}.pagina.mps_21_01_26_2\`
      ),

      -- =========================
      -- MPS vieja (06/08/25)
      -- =========================
      mps06 AS (
        SELECT
          REGEXP_REPLACE(CAST(sap AS STRING), r'[^0-9]', '') AS key_mps,
          ROUND(SAFE_CAST(price_diamond AS FLOAT64), 2) AS hdn_diamond_titanium_usd,
          ROUND(SAFE_CAST(price_black   AS FLOAT64), 2) AS hdnhsp_blackusd,
          ROUND(SAFE_CAST(price_platino AS FLOAT64), 2) AS hdnhsp_platinum_usd,
          ROUND(SAFE_CAST(price_ruby    AS FLOAT64), 2) AS hsphsi_ruby_usd,
          ROUND(SAFE_CAST(price_map_web_usd_iva AS FLOAT64), 2) AS map_web_usd_iva
        FROM \`${projectId}.pagina.mps_06_08_25_2\`
      ),

      -- =========================
      -- PRODUCTOS SIN PRECIOS (PSP)
      -- =========================
      psp AS (
        SELECT
          CAST(SAP AS STRING) AS key_sap,
          ROUND(SAFE_CAST(Ruby AS FLOAT64), 2) AS ruby_psp,
          ROUND(SAFE_CAST(Gold_Gremio AS FLOAT64), 2) AS gold_gremio_psp,
          ROUND(SAFE_CAST(PVP AS FLOAT64), 2) AS pvp_psp
        FROM \`${projectId}.pagina.productos_sin_precios\`
        WHERE SAP IS NOT NULL
      ),

      -- =========================
      -- Hikvision con precios de lista MPS (fallback 21 -> 06)
      -- =========================
      hik_base_prices AS (
      SELECT
        h.*,
        COALESCE(NULLIF(m_sep.hdn_diamond_titanium_usd, 0), NULLIF(m18.hdn_diamond_titanium_usd, 0), NULLIF(m21.hdn_diamond_titanium_usd, 0), m06.hdn_diamond_titanium_usd) AS diamond_list,
        COALESCE(NULLIF(m_sep.hdnhsp_blackusd, 0),          NULLIF(m18.hdnhsp_blackusd, 0),          NULLIF(m21.hdnhsp_blackusd, 0),          m06.hdnhsp_blackusd)          AS black_list,
        COALESCE(NULLIF(m_sep.hdnhsp_platinum_usd, 0),      NULLIF(m18.hdnhsp_platinum_usd, 0),      NULLIF(m21.hdnhsp_platinum_usd, 0),      m06.hdnhsp_platinum_usd)       AS platinum_list,
        COALESCE(NULLIF(m_sep.hsphsi_ruby_usd, 0),          NULLIF(m18.hsphsi_ruby_usd, 0),          NULLIF(m21.hsphsi_ruby_usd, 0),          m06.hsphsi_ruby_usd)           AS ruby_list,
        COALESCE(NULLIF(m_sep.gold_gremio, 0),              NULLIF(m18.gold_gremio, 0),              NULLIF(m21.gold_gremio, 0),              NULL)                          AS gold_gremio_list,
        COALESCE(NULLIF(m_sep.map_web_usd_iva, 0),          NULLIF(m18.pvp_list, 0),                 NULLIF(m21.map_web_usd_iva, 0),          m06.map_web_usd_iva)           AS pvp_list      FROM hik h
      LEFT JOIN mps_sep m_sep ON h.key_hik_mps = m_sep.key_mps
      LEFT JOIN mps18 m18 ON h.key_hik_mps = m18.key_mps
      LEFT JOIN mps21 m21 ON h.key_hik_mps = m21.key_mps
      LEFT JOIN mps06 m06 ON h.key_hik_mps = m06.key_mps
    ),

      -- =========================
      -- OFERTAS MASTER: Override de precios + Flags
      -- =========================
      ofertas_master AS (
        SELECT
          REGEXP_REPLACE(LOWER(CAST(cod_bejerman AS STRING)), r'[^0-9a-z]', '') AS key_bej,
          REGEXP_REPLACE(LOWER(CAST(modelo AS STRING)), r'[^0-9a-z]', '')       AS key_mod,
          -- Tomamos gold o gremio indistintamente para el override
          COALESCE(ROUND(SAFE_CAST(gold AS FLOAT64), 2), ROUND(SAFE_CAST(gremio AS FLOAT64), 2)) AS gold_gremio_off,
          ROUND(SAFE_CAST(ruby AS FLOAT64), 2)         AS ruby_off,
          ROUND(SAFE_CAST(dpp_platinum AS FLOAT64), 2) AS platinum_off,
          ROUND(SAFE_CAST(dpp_black AS FLOAT64), 2)    AS black_off,
          ROUND(SAFE_CAST(dpp_diamond AS FLOAT64), 2)  AS diamond_off,
          ROUND(SAFE_CAST(pvp AS FLOAT64), 2)          AS pvp_off,
          ROUND(SAFE_CAST(epp AS FLOAT64), 2)          AS epp_off,
          CAST(oferta AS STRING)                       AS oferta_txt,
          ARRAY_TO_STRING([
            IF(SAFE_CAST(dpp_diamond AS FLOAT64) > 0, 'diamond', NULL),
            IF(SAFE_CAST(dpp_black AS FLOAT64) > 0, 'black', NULL),
            IF(SAFE_CAST(dpp_platinum AS FLOAT64) > 0, 'platinum', NULL),
            IF(SAFE_CAST(ruby AS FLOAT64) > 0, 'ruby', NULL),
            IF(SAFE_CAST(gold AS FLOAT64) > 0 OR SAFE_CAST(gremio AS FLOAT64) > 0, 'gold_gremio', NULL),
            IF(SAFE_CAST(pvp AS FLOAT64) > 0, 'pvp', NULL),
            IF(SAFE_CAST(epp AS FLOAT64) > 0, 'epp', NULL),
            IF(oferta IS NOT NULL AND oferta != '', 'oferta', NULL)
          ], ',') AS flags
        FROM \`${projectId}.pagina.ofertas\`
      ),

      -- =========================
      -- STOCK Y TRÁNSITO
      -- =========================
      stock AS (
        SELECT
          REGEXP_REPLACE(LOWER(CAST(Codigo AS STRING)), r'[^0-9a-z]', '') AS key_bej,
          SAFE_CAST(Disponible AS INT64) AS disponible
        FROM \`${projectId}.pagina.stock_ultima_actualizacion\`
      ),

      transito AS (
        SELECT
          REGEXP_REPLACE(LOWER(CAST(bejerman AS STRING)), r'[^0-9a-z]', '') AS key_bej,
          SAFE_CAST(total_en_transito AS FLOAT64) AS total_en_transito
        FROM \`${projectId}.pagina.en_transito\`
      ),

      -- =========================
      -- UNIFICACIÓN DE TODAS LAS FUENTES
      -- =========================
      unified_catalog AS (
        -- Hikvision (desde hik_base_prices)
        SELECT
          CAST(hik_code AS STRING) AS sap,
          CAST(cod_bejerman AS STRING) AS cod_bejerman,
          modelo, descripcion, marca, categoria, subcategoria,
          diamond_list AS diamond, black_list AS black, platinum_list AS platinum, ruby_list AS ruby,
          gold_gremio_list AS gold_gremio, pvp_list AS pvp,
          CAST(NULL AS FLOAT64) AS epp, CAST(NULL AS FLOAT64) AS iva,
          key_bej
        FROM hik_base_prices

        UNION ALL
        -- Digifort
        SELECT NULL, NULL, modelo, descripcion, marca, categoria, subcategoria,
          NULL, NULL, NULL, NULL, ROUND(SAFE_CAST(gremio AS FLOAT64), 2), ROUND(SAFE_CAST(usuario_final AS FLOAT64), 2),
          NULL, ROUND(SAFE_CAST(iva AS FLOAT64), 3),
          REGEXP_REPLACE(LOWER(CAST(modelo AS STRING)), r'[^0-9a-z]', '') -- usa modelo como key si no hay bej
        FROM \`${projectId}.pagina.digifort\`

        UNION ALL
        -- Ezviz
        SELECT CAST(hik_code AS STRING), CAST(cod_bejerman AS STRING), modelo, descripcion, marca, categoria, subcategoria,
          NULL, NULL, NULL, NULL, ROUND(SAFE_CAST(gremio AS FLOAT64), 2), NULL,
          ROUND(SAFE_CAST(epp AS FLOAT64), 2), NULL,
          REGEXP_REPLACE(LOWER(CAST(cod_bejerman AS STRING)), r'[^0-9a-z]', '')
        FROM \`${projectId}.pagina.ezviz\`

        UNION ALL
        -- Hikmicro
        SELECT CAST(hik_code AS STRING), CAST(cod_bejerman AS STRING), modelo, descripcion, marca, categoria, subcategoria,
          NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
          REGEXP_REPLACE(LOWER(CAST(cod_bejerman AS STRING)), r'[^0-9a-z]', '')
        FROM \`${projectId}.pagina.hikmicro\`

        UNION ALL
        -- Outlet
        SELECT CAST(hik_code AS STRING), CAST(cod_bejerman AS STRING), modelo, descripcion, marca, categoria, subcategoria,
          NULL, NULL, NULL, NULL, ROUND(SAFE_CAST(gremio AS FLOAT64), 2), NULL,
          ROUND(SAFE_CAST(epp AS FLOAT64), 2), ROUND(SAFE_CAST(iva AS FLOAT64), 3),
          REGEXP_REPLACE(LOWER(CAST(cod_bejerman AS STRING)), r'[^0-9a-z]', '')
        FROM \`${projectId}.pagina.outlet\`

        UNION ALL
        -- Ranger
        SELECT NULL, CAST(cod_bejerman AS STRING), modelo, descripcion, marca, categoria, subcategoria,
          NULL, NULL, NULL, NULL, ROUND(SAFE_CAST(gremio AS FLOAT64), 2), ROUND(SAFE_CAST(cliente_final AS FLOAT64), 2),
          NULL, ROUND(SAFE_CAST(iva AS FLOAT64), 3),
          REGEXP_REPLACE(LOWER(CAST(cod_bejerman AS STRING)), r'[^0-9a-z]', '')
        FROM \`${projectId}.pagina.ranger\`

        UNION ALL
        -- Seagate
        SELECT CAST(hik_code AS STRING), CAST(cod_bejerman AS STRING), modelo, descripcion, marca, categoria, subcategoria,
          NULL, NULL, NULL, NULL, ROUND(SAFE_CAST(gremio AS FLOAT64), 2), NULL,
          NULL, ROUND(SAFE_CAST(iva AS FLOAT64), 3),
          REGEXP_REPLACE(LOWER(CAST(cod_bejerman AS STRING)), r'[^0-9a-z]', '')
        FROM \`${projectId}.pagina.seagate\`

        UNION ALL
        -- Takex
        SELECT NULL, NULL, modelo, descripcion, marca, categoria, subcategoria,
          NULL, NULL, NULL, NULL, ROUND(SAFE_CAST(gremio AS FLOAT64), 2), NULL,
          NULL, ROUND(SAFE_CAST(iva AS FLOAT64), 3),
          REGEXP_REPLACE(LOWER(CAST(modelo AS STRING)), r'[^0-9a-z]', '')
        FROM \`${projectId}.pagina.takex\`

        UNION ALL
        -- Ultracell
        SELECT NULL, NULL, modelo, descripcion, marca, categoria, subcategoria,
          NULL, NULL, NULL, NULL, ROUND(SAFE_CAST(gremio AS FLOAT64), 2), NULL,
          NULL, ROUND(SAFE_CAST(iva AS FLOAT64), 3),
          REGEXP_REPLACE(LOWER(CAST(modelo AS STRING)), r'[^0-9a-z]', '')
        FROM \`${projectId}.pagina.ultracell\`

        UNION ALL
        -- Vivotek (SIN iva en tabla)
        SELECT NULL, CAST(cod_bej AS STRING), modelo, descripcion, marca, categoria, subcategoria,
          NULL, NULL, NULL, NULL, ROUND(SAFE_CAST(gremio AS FLOAT64), 2), ROUND(SAFE_CAST(cliente_final AS FLOAT64), 2),
          NULL, NULL, -- iva es NULL aquí
          REGEXP_REPLACE(LOWER(CAST(cod_bej AS STRING)), r'[^0-9a-z]', '')
        FROM \`${projectId}.pagina.vivotek\`

        UNION ALL
        -- Vortex
        SELECT NULL, CAST(cod_bej AS STRING), modelo, descripcion, marca, categoria, subcategoria,
          NULL, NULL, NULL, NULL, ROUND(SAFE_CAST(gremio AS FLOAT64), 2), ROUND(SAFE_CAST(cliente_final AS FLOAT64), 2),
          NULL, ROUND(SAFE_CAST(iva AS FLOAT64), 3),
          REGEXP_REPLACE(LOWER(CAST(cod_bej AS STRING)), r'[^0-9a-z]', '')
        FROM \`${projectId}.pagina.vortex\`
      )

    -- =========================
    -- SELECT FINAL: Aplicamos override de OFERTAS sobre el catálogo unificado
    -- =========================
    SELECT
      CAST(U.sap AS STRING)           AS sap,
      CAST(U.modelo AS STRING)        AS modelo,
      CAST(U.descripcion AS STRING)   AS descripcion,
      CAST(U.marca AS STRING)         AS marca,
      CAST(U.categoria AS STRING)     AS categoria,
      CAST(U.subcategoria AS STRING)  AS subcategoria,

      -- Precios con OVERRIDE: Si existe en ofertas, manda oferta (SOLO RUBY). Sino, manda catálogo -> PSP.
      CAST(COALESCE(NULLIF(O.ruby_off, 0), NULLIF(U.ruby, 0), P.ruby_psp) AS STRING) AS ruby,
      SAFE_CAST(COALESCE(NULLIF(U.gold_gremio, 0), P.gold_gremio_psp) AS FLOAT64) AS gold_gremio,
      SAFE_CAST(COALESCE(NULLIF(U.pvp, 0), P.pvp_psp) AS FLOAT64)         AS pvp,
      
      SAFE_CAST(COALESCE(NULLIF(O.epp_off, 0),         U.epp)         AS FLOAT64) AS epp,
      SAFE_CAST(U.iva AS FLOAT64)         AS iva,
      COALESCE(O.flags, '')               AS es_oferta,

      -- Stock y Transito
      COALESCE(S.disponible, 0)           AS disponible,
      IF(COALESCE(T.total_en_transito, 0) > 0, 'Si', 'No') AS en_transito

    FROM unified_catalog U
    LEFT JOIN ofertas_master O 
      ON (U.key_bej IS NOT NULL AND U.key_bej = O.key_bej)
      OR (U.key_bej IS NULL AND REGEXP_REPLACE(LOWER(CAST(U.modelo AS STRING)), r'[^0-9a-z]', '') = O.key_mod)
    LEFT JOIN stock S ON U.key_bej = S.key_bej
    LEFT JOIN transito T ON U.key_bej = T.key_bej
    LEFT JOIN psp P ON U.sap = P.key_sap
    
    ORDER BY marca, modelo
    `;

  const request = {
    query: query,
    useLegacySql: false,
    // ✅ IMPORTANTE: tus tablas pagina.* están en us-central1
    location: "us-central1"
  };

  const job = BigQuery.Jobs.query(request, projectId);

  const rows = (job.rows || []).map(r => {
    const f = r.f || [];
    return {
      sap:          f[0]?.v ?? "",
      modelo:       f[1]?.v ?? "",
      descripcion:  f[2]?.v ?? "",
      marca:        f[3]?.v ?? "",
      categoria:    f[4]?.v ?? "",
      subcategoria: f[5]?.v ?? "",
      ruby:         f[6]?.v ?? "",
      gold_gremio:  f[7]?.v ?? "",
      pvp:          f[8]?.v ?? "",
      epp:          f[9]?.v ?? "",
      iva:          f[10]?.v ?? "",
      es_oferta:    f[11]?.v ?? "",
      disponible:   f[12]?.v ?? "",
      en_transito:  f[13]?.v ?? ""
    };
  });

  return rows;
}

function getProductosNuevosFromBQ() {
  const projectId = "selnet-476815";

  const query = `
  -- PRODUCTOS NUEVOS (pagina.productos_nuevos) + ENRIQUECIDO con HOME (match por Bejerman)
  WITH
    -- =========================
    -- HIK BASE
    -- =========================
    hik AS (
      SELECT
        CAST(hik_code AS STRING) AS hik_code,
        CAST(cod_bejerman AS STRING) AS cod_bejerman,
        CAST(modelo AS STRING) AS modelo,
        CAST(descripcion AS STRING) AS descripcion,
        CAST(marca AS STRING) AS marca,
        CAST(categoria AS STRING) AS categoria,
        CAST(subcategoria AS STRING) AS subcategoria,
        REGEXP_REPLACE(CAST(hik_code AS STRING), r'[^0-9]', '') AS key_hik_mps,
        REGEXP_REPLACE(LOWER(CAST(cod_bejerman AS STRING)), r'[^0-9a-z]', '') AS key_bej
      FROM \`${projectId}.pagina.hikvision\`
    ),

    -- =========================
    -- MPS NUEVA (18/09/26)
    -- =========================
    mps_sep AS (
      SELECT
        REGEXP_REPLACE(CAST(sap_code AS STRING), r'[^0-9]', '') AS key_mps,
        ROUND(SAFE_CAST(diamond AS FLOAT64), 2) AS hdn_diamond_titanium_usd,
        ROUND(SAFE_CAST(black AS FLOAT64), 2)   AS hdnhsp_blackusd,
        ROUND(SAFE_CAST(platinum AS FLOAT64), 2) AS hdnhsp_platinum_usd,
        ROUND(SAFE_CAST(ruby AS FLOAT64), 2)    AS hsphsi_ruby_usd,
        ROUND(SAFE_CAST(gold_gremio AS FLOAT64), 2) AS gold_gremio,
        ROUND(SAFE_CAST(map_web_usd_sin_iva AS FLOAT64), 2) AS map_web_usd_iva
      FROM \`${projectId}.pagina.mps_18_09_26\`
    ),

    mps18 AS (
      SELECT
        REGEXP_REPLACE(CAST(sap AS STRING), r'[^0-9]', '') AS key_mps,
        ROUND(SAFE_CAST(hdn_diamond_titanium_usd AS FLOAT64), 2) AS hdn_diamond_titanium_usd,
        ROUND(SAFE_CAST(hdnhsp_blackusd AS FLOAT64), 2) AS hdnhsp_blackusd,
        ROUND(SAFE_CAST(hdnhsp_platinum_usd AS FLOAT64), 2) AS hdnhsp_platinum_usd,
        ROUND(SAFE_CAST(hsphsi_ruby_usd AS FLOAT64), 2) AS hsphsi_ruby_usd,
        ROUND(SAFE_CAST(gold_gremio AS FLOAT64), 2) AS gold_gremio,
        ROUND(SAFE_CAST(pvp AS FLOAT64), 2) AS pvp_list
      FROM \`${projectId}.pagina.mps_18_05_26\`
    ),

    mps21 AS (
      SELECT
        REGEXP_REPLACE(CAST(sap AS STRING), r'[^0-9]', '') AS key_mps,
        ROUND(SAFE_CAST(hdn_diamond_titanium_usd AS FLOAT64), 2) AS hdn_diamond_titanium_usd,
        ROUND(SAFE_CAST(hdnhsp_blackusd AS FLOAT64), 2) AS hdnhsp_blackusd,
        ROUND(SAFE_CAST(hdnhsp_platinum_usd AS FLOAT64), 2) AS hdnhsp_platinum_usd,
        ROUND(SAFE_CAST(hsphsi_ruby_usd AS FLOAT64), 2) AS hsphsi_ruby_usd,
        ROUND(SAFE_CAST(gold_gremio AS FLOAT64), 2) AS gold_gremio,
        ROUND(SAFE_CAST(map_web_usd_iva AS FLOAT64), 2) AS map_web_usd_iva
      FROM \`${projectId}.pagina.mps_21_01_26_2\`
    ),

    mps06 AS (
      SELECT
        REGEXP_REPLACE(CAST(sap AS STRING), r'[^0-9]', '') AS key_mps,
        ROUND(SAFE_CAST(price_diamond AS FLOAT64), 2) AS hdn_diamond_titanium_usd,
        ROUND(SAFE_CAST(price_black   AS FLOAT64), 2) AS hdnhsp_blackusd,
        ROUND(SAFE_CAST(price_platino AS FLOAT64), 2) AS hdnhsp_platinum_usd,
        ROUND(SAFE_CAST(price_ruby    AS FLOAT64), 2) AS hsphsi_ruby_usd,
        ROUND(SAFE_CAST(price_map_web_usd_iva AS FLOAT64), 2) AS map_web_usd_iva
      FROM \`${projectId}.pagina.mps_06_08_25_2\`
    ),

    -- =========================
    -- PRODUCTOS SIN PRECIOS (PSP)
    -- =========================
    psp AS (
      SELECT
        CAST(SAP AS STRING) AS key_sap,
        ROUND(SAFE_CAST(Ruby AS FLOAT64), 2) AS ruby_psp,
        ROUND(SAFE_CAST(Gold_Gremio AS FLOAT64), 2) AS gold_gremio_psp,
        ROUND(SAFE_CAST(PVP AS FLOAT64), 2) AS pvp_psp
      FROM \`${projectId}.pagina.productos_sin_precios\`
      WHERE SAP IS NOT NULL
    ),

    -- =========================
    -- OFERTAS MASTER
    -- =========================
    ofertas_master AS (
      SELECT
        REGEXP_REPLACE(LOWER(CAST(cod_bejerman AS STRING)), r'[^0-9a-z]', '') AS key_bej,
        REGEXP_REPLACE(LOWER(CAST(modelo AS STRING)), r'[^0-9a-z]', '')       AS key_mod,
        COALESCE(ROUND(SAFE_CAST(gold AS FLOAT64), 2), ROUND(SAFE_CAST(gremio AS FLOAT64), 2)) AS gold_gremio_off,
        ROUND(SAFE_CAST(ruby AS FLOAT64), 2)         AS ruby_off,
        ROUND(SAFE_CAST(dpp_platinum AS FLOAT64), 2) AS platinum_off,
        ROUND(SAFE_CAST(dpp_black AS FLOAT64), 2)    AS black_off,
        ROUND(SAFE_CAST(dpp_diamond AS FLOAT64), 2)  AS diamond_off,
        ROUND(SAFE_CAST(pvp AS FLOAT64), 2)          AS pvp_off,
        ROUND(SAFE_CAST(epp AS FLOAT64), 2)          AS epp_off,
        CAST(oferta AS STRING)                       AS oferta_txt,
        ARRAY_TO_STRING([
          IF(SAFE_CAST(dpp_diamond AS FLOAT64) > 0, 'diamond', NULL),
          IF(SAFE_CAST(dpp_black AS FLOAT64) > 0, 'black', NULL),
          IF(SAFE_CAST(dpp_platinum AS FLOAT64) > 0, 'platinum', NULL),
          IF(SAFE_CAST(ruby AS FLOAT64) > 0, 'ruby', NULL),
          IF(SAFE_CAST(gold AS FLOAT64) > 0 OR SAFE_CAST(gremio AS FLOAT64) > 0, 'gold_gremio', NULL),
          IF(SAFE_CAST(pvp AS FLOAT64) > 0, 'pvp', NULL),
          IF(SAFE_CAST(epp AS FLOAT64) > 0, 'epp', NULL),
          IF(oferta IS NOT NULL AND oferta != '', 'oferta', NULL)
        ], ',') AS flags
      FROM \`${projectId}.pagina.ofertas\`
    ),

    -- =========================
    -- STOCK Y TRÁNSITO
    -- =========================
    stock AS (
      SELECT
        REGEXP_REPLACE(LOWER(CAST(Codigo AS STRING)), r'[^0-9a-z]', '') AS key_bej,
        SAFE_CAST(Disponible AS INT64) AS disponible
      FROM \`${projectId}.pagina.stock_ultima_actualizacion\`
    ),

    transito AS (
      SELECT
        REGEXP_REPLACE(LOWER(CAST(bejerman AS STRING)), r'[^0-9a-z]', '') AS key_bej,
        SAFE_CAST(total_en_transito AS FLOAT64) AS total_en_transito
      FROM \`${projectId}.pagina.en_transito\`
    ),

    -- =========================
    -- CATÁLOGO UNIFICADO (Base para el enriquecimiento)
    -- =========================
    catalog_unified AS (
      SELECT 
        U.*,
        O.gold_gremio_off, O.ruby_off, O.platinum_off, O.black_off, O.diamond_off, O.pvp_off, O.epp_off, O.oferta_txt, O.flags
      FROM (
        -- Hikvision base
        SELECT 
          CAST(h.hik_code AS STRING) AS sap, CAST(h.cod_bejerman AS STRING) AS cod_bejerman, h.modelo, h.descripcion, h.marca, h.categoria, h.subcategoria,
          COALESCE(NULLIF(m_sep.hdn_diamond_titanium_usd, 0), NULLIF(m18.hdn_diamond_titanium_usd, 0), NULLIF(m21.hdn_diamond_titanium_usd, 0), m06.hdn_diamond_titanium_usd) AS diamond_list,
          COALESCE(NULLIF(m_sep.hdnhsp_blackusd, 0),          NULLIF(m18.hdnhsp_blackusd, 0),          NULLIF(m21.hdnhsp_blackusd, 0),          m06.hdnhsp_blackusd) AS black_list,
          COALESCE(NULLIF(m_sep.hdnhsp_platinum_usd, 0),      NULLIF(m18.hdnhsp_platinum_usd, 0),      NULLIF(m21.hdnhsp_platinum_usd, 0),      m06.hdnhsp_platinum_usd) AS platinum_list,
          COALESCE(NULLIF(m_sep.hsphsi_ruby_usd, 0),          NULLIF(m18.hsphsi_ruby_usd, 0),          NULLIF(m21.hsphsi_ruby_usd, 0),          m06.hsphsi_ruby_usd) AS ruby_list,
          COALESCE(NULLIF(m_sep.gold_gremio, 0),              NULLIF(m18.gold_gremio, 0),              NULLIF(m21.gold_gremio, 0),              NULL) AS gold_gremio_list,
          COALESCE(NULLIF(m_sep.map_web_usd_iva, 0),          NULLIF(m18.pvp_list, 0),                 NULLIF(m21.map_web_usd_iva, 0),          m06.map_web_usd_iva) AS pvp_list,
          CAST(NULL AS FLOAT64) AS epp, CAST(NULL AS FLOAT64) AS iva,
          h.key_bej
        FROM hik h
        LEFT JOIN mps_sep m_sep ON h.key_hik_mps = m_sep.key_mps
        LEFT JOIN mps18 m18 ON h.key_hik_mps = m18.key_mps
        LEFT JOIN mps21 m21 ON h.key_hik_mps = m21.key_mps
        LEFT JOIN mps06 m06 ON h.key_hik_mps = m06.key_mps

        UNION ALL
        -- Digifort
        SELECT NULL, NULL, modelo, descripcion, marca, categoria, subcategoria,
          NULL, NULL, NULL, NULL, ROUND(SAFE_CAST(gremio AS FLOAT64), 2), ROUND(SAFE_CAST(usuario_final AS FLOAT64), 2),
          NULL, ROUND(SAFE_CAST(iva AS FLOAT64), 3),
          REGEXP_REPLACE(LOWER(CAST(modelo AS STRING)), r'[^0-9a-z]', '')
        FROM \`${projectId}.pagina.digifort\`

        UNION ALL
        -- Ezviz
        SELECT CAST(hik_code AS STRING), CAST(cod_bejerman AS STRING), modelo, descripcion, marca, categoria, subcategoria,
          NULL, NULL, NULL, NULL, ROUND(SAFE_CAST(gremio AS FLOAT64), 2), NULL,
          ROUND(SAFE_CAST(epp AS FLOAT64), 2), NULL,
          REGEXP_REPLACE(LOWER(CAST(cod_bejerman AS STRING)), r'[^0-9a-z]', '')
        FROM \`${projectId}.pagina.ezviz\`

        UNION ALL
        -- Hikmicro
        SELECT CAST(hik_code AS STRING), CAST(cod_bejerman AS STRING), modelo, descripcion, marca, categoria, subcategoria,
          NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
          REGEXP_REPLACE(LOWER(CAST(cod_bejerman AS STRING)), r'[^0-9a-z]', '')
        FROM \`${projectId}.pagina.hikmicro\`

        UNION ALL
        -- Outlet
        SELECT CAST(hik_code AS STRING), CAST(cod_bejerman AS STRING), modelo, descripcion, marca, categoria, subcategoria,
          NULL, NULL, NULL, NULL, ROUND(SAFE_CAST(gremio AS FLOAT64), 2), NULL,
          ROUND(SAFE_CAST(epp AS FLOAT64), 2), ROUND(SAFE_CAST(iva AS FLOAT64), 3),
          REGEXP_REPLACE(LOWER(CAST(cod_bejerman AS STRING)), r'[^0-9a-z]', '')
        FROM \`${projectId}.pagina.outlet\`

        UNION ALL
        -- Ranger
        SELECT NULL, CAST(cod_bejerman AS STRING), modelo, descripcion, marca, categoria, subcategoria,
          NULL, NULL, NULL, NULL, ROUND(SAFE_CAST(gremio AS FLOAT64), 2), ROUND(SAFE_CAST(cliente_final AS FLOAT64), 2),
          NULL, ROUND(SAFE_CAST(iva AS FLOAT64), 3),
          REGEXP_REPLACE(LOWER(CAST(cod_bejerman AS STRING)), r'[^0-9a-z]', '')
        FROM \`${projectId}.pagina.ranger\`

        UNION ALL
        -- Seagate
        SELECT CAST(hik_code AS STRING), CAST(cod_bejerman AS STRING), modelo, descripcion, marca, categoria, subcategoria,
          NULL, NULL, NULL, NULL, ROUND(SAFE_CAST(gremio AS FLOAT64), 2), NULL,
          NULL, ROUND(SAFE_CAST(iva AS FLOAT64), 3),
          REGEXP_REPLACE(LOWER(CAST(cod_bejerman AS STRING)), r'[^0-9a-z]', '')
        FROM \`${projectId}.pagina.seagate\`

        UNION ALL
        -- Takex
        SELECT NULL, NULL, modelo, descripcion, marca, categoria, subcategoria,
          NULL, NULL, NULL, NULL, ROUND(SAFE_CAST(gremio AS FLOAT64), 2), NULL,
          NULL, ROUND(SAFE_CAST(iva AS FLOAT64), 3),
          REGEXP_REPLACE(LOWER(CAST(modelo AS STRING)), r'[^0-9a-z]', '')
        FROM \`${projectId}.pagina.takex\`

        UNION ALL
        -- Ultracell
        SELECT NULL, NULL, modelo, descripcion, marca, categoria, subcategoria,
          NULL, NULL, NULL, NULL, ROUND(SAFE_CAST(gremio AS FLOAT64), 2), NULL,
          NULL, ROUND(SAFE_CAST(iva AS FLOAT64), 3),
          REGEXP_REPLACE(LOWER(CAST(modelo AS STRING)), r'[^0-9a-z]', '')
        FROM \`${projectId}.pagina.ultracell\`

        UNION ALL
        -- Vivotek
        SELECT NULL, CAST(cod_bej AS STRING), modelo, descripcion, marca, categoria, subcategoria,
          NULL, NULL, NULL, NULL, ROUND(SAFE_CAST(gremio AS FLOAT64), 2), ROUND(SAFE_CAST(cliente_final AS FLOAT64), 2),
          NULL, NULL, -- No tiene iva
          REGEXP_REPLACE(LOWER(CAST(cod_bej AS STRING)), r'[^0-9a-z]', '')
        FROM \`${projectId}.pagina.vivotek\`

        UNION ALL
        -- Vortex
        SELECT NULL, CAST(cod_bej AS STRING), modelo, descripcion, marca, categoria, subcategoria,
          NULL, NULL, NULL, NULL, ROUND(SAFE_CAST(gremio AS FLOAT64), 2), ROUND(SAFE_CAST(cliente_final AS FLOAT64), 2),
          NULL, ROUND(SAFE_CAST(iva AS FLOAT64), 3),
          REGEXP_REPLACE(LOWER(CAST(cod_bej AS STRING)), r'[^0-9a-z]', '')
        FROM \`${projectId}.pagina.vortex\`
      ) U
      LEFT JOIN ofertas_master O ON U.key_bej = O.key_bej
    ),

    pn AS (
      SELECT
        CAST(marca AS STRING)  AS marca,
        CAST(codigo AS STRING) AS codigo,
        REGEXP_REPLACE(LOWER(CAST(codigo AS STRING)), r'[^0-9a-z]', '') AS key_codigo
      FROM \`${projectId}.pagina.productos_nuevos\`
      WHERE codigo IS NOT NULL
        AND LOWER(marca) NOT IN ('dsc', 'bentel', 'system sensor', 'bentel - fireclass')
    )

  -- =========================
  -- RESULTADO FINAL PN
  -- =========================
  SELECT
    COALESCE(h.marca, pn.marca) AS marca,
    h.sap,
    h.modelo,
    h.descripcion,
    h.categoria,
    h.subcategoria,
    -- Aplicamos Override de Ofertas en PN (SOLO RUBY) -> Fallback PSP
    CAST(COALESCE(NULLIF(h.ruby_off, 0), NULLIF(h.ruby_list, 0), P.ruby_psp) AS STRING) AS ruby,
    SAFE_CAST(COALESCE(NULLIF(h.gold_gremio_list, 0), P.gold_gremio_psp) AS FLOAT64) AS gold_gremio,
    SAFE_CAST(COALESCE(NULLIF(h.pvp_list, 0), P.pvp_psp) AS FLOAT64)         AS pvp,
    SAFE_CAST(COALESCE(NULLIF(h.epp_off, 0),         h.epp)              AS FLOAT64) AS epp,
    h.iva,
    COALESCE(h.flags, '') AS es_oferta,
    
    -- Stock y Transito
    COALESCE(S.disponible, 0) AS disponible,
    IF(COALESCE(T.total_en_transito, 0) > 0, 'Si', 'No') AS en_transito,

    pn.codigo AS codigo_producto_nuevo

  FROM pn
  LEFT JOIN catalog_unified h ON pn.key_codigo = h.key_bej
  LEFT JOIN stock S ON pn.key_codigo = S.key_bej
  LEFT JOIN transito T ON pn.key_codigo = T.key_bej
  LEFT JOIN psp P ON h.sap = P.key_sap
  ORDER BY marca, modelo, codigo_producto_nuevo;
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
      modelo:       f[2]?.v ?? "",
      descripcion:  f[3]?.v ?? "",
      categoria:    f[4]?.v ?? "",
      subcategoria: f[5]?.v ?? "",
      ruby:         f[6]?.v ?? "",
      gold_gremio:  f[7]?.v ?? "",
      pvp:          f[8]?.v ?? "",
      epp:          f[9]?.v ?? "",
      iva:          f[10]?.v ?? "",
      es_oferta:    f[11]?.v ?? "",
      disponible:   f[12]?.v ?? "",
      en_transito:  f[13]?.v ?? ""
    };
  });

  return rows;
}

// PAGINA DE DIGIFORT ----------------------------------
function getDigifortFromBQ() {
  const projectId = "selnet-476815";

  const query = `
    SELECT
      NULLIF(LOWER(CAST(modelo AS STRING)), 'nan') AS modelo,
      NULLIF(LOWER(CAST(descripcion AS STRING)), 'nan') AS descripcion,
      CAST(categoria AS STRING) AS categoria,
      CAST(subcategoria AS STRING) AS subcategoria,
      ROUND(SAFE_CAST(gremio AS FLOAT64), 2) AS gremio,
      ROUND(SAFE_CAST(usuario_final AS FLOAT64), 2) AS usuario_final,
      ROUND(SAFE_CAST(iva AS FLOAT64), 3) AS iva,
      CAST(unidades AS STRING) AS unidades
    FROM \`${projectId}.pagina.digifort\`
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

  const query = `
    WITH base AS (
      SELECT
        NULLIF(LOWER(CAST(hik_code AS STRING)), 'nan') AS hik_code,
        NULLIF(LOWER(CAST(cod_bejerman AS STRING)), 'nan') AS cod_bejerman,
        NULLIF(LOWER(CAST(nomenclatura_oficial AS STRING)), 'nan') AS nomenclatura_oficial,
        NULLIF(LOWER(CAST(modelo AS STRING)), 'nan') AS modelo,
        NULLIF(LOWER(CAST(descripcion AS STRING)), 'nan') AS descripcion,
        CAST(categoria AS STRING) AS categoria,
        CAST(subcategoria AS STRING) AS subcategoria,
        ROUND(SAFE_CAST(gremio AS FLOAT64), 2) AS gremio,
        ROUND(SAFE_CAST(epp AS FLOAT64), 2) AS epp,

        -- clave normalizada para cruces
        REGEXP_REPLACE(LOWER(CAST(cod_bejerman AS STRING)), r'[^0-9a-z]', '') AS key_bej
      FROM \`${projectId}.pagina.ezviz\`
    ),

    stock AS (
      SELECT
        REGEXP_REPLACE(LOWER(CAST(Codigo AS STRING)), r'[^0-9a-z]', '') AS key_bej,
        SAFE_CAST(Disponible AS INT64) AS disponible
      FROM \`${projectId}.pagina.stock_ultima_actualizacion\`
    ),

    transito AS (
      SELECT
        REGEXP_REPLACE(LOWER(CAST(bejerman AS STRING)), r'[^0-9a-z]', '') AS key_bej,
        SAFE_CAST(total_en_transito AS FLOAT64) AS total_en_transito
      FROM \`${projectId}.pagina.en_transito\`
    ),

    ofertas_cte AS (
      SELECT 
        REGEXP_REPLACE(LOWER(CAST(cod_bejerman AS STRING)), r'[^0-9a-z]', '') AS key_bej,
        ARRAY_TO_STRING([
          IF(SAFE_CAST(gold AS FLOAT64) > 0, 'gold', NULL),
          IF(SAFE_CAST(pvp AS FLOAT64) > 0, 'pvp', NULL),
          IF(oferta IS NOT NULL AND oferta != '', 'oferta', NULL)
        ], ',') AS es_oferta,
        oferta
      FROM \`${projectId}.pagina.ofertas\`
      WHERE cod_bejerman IS NOT NULL
    )

    SELECT
      b.hik_code,
      b.nomenclatura_oficial,
      b.modelo,
      b.descripcion,
      b.categoria,
      b.subcategoria,
      b.gremio,
      b.epp,

      s.disponible,

      IF(COALESCE(t.total_en_transito, 0) > 0, "Si", "No") AS en_transito,
      COALESCE(o.es_oferta, '') AS es_oferta

    FROM base b
    LEFT JOIN stock s
      ON b.key_bej = s.key_bej
    LEFT JOIN transito t
      ON b.key_bej = t.key_bej
    LEFT JOIN ofertas_cte o
      ON b.key_bej = o.key_bej

    ORDER BY b.modelo
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
    nomenclatura_oficial: r.f[1]?.v ?? "",
    modelo: r.f[2]?.v ?? "",
    descripcion: r.f[3]?.v ?? "",
    categoria: r.f[4]?.v ?? "",
    subcategoria: r.f[5]?.v ?? "",
    gremio: r.f[6]?.v ?? "",
    epp: r.f[7]?.v ?? "",
    disponible: r.f[8]?.v ?? "",
    en_transito: r.f[9]?.v ?? "",
    oferta: r.f[10]?.v ?? "",
    es_oferta: r.f[11]?.v ?? ""
  }));
}

// PAGINA DE HIKMICRO ----------------------------------
function getHikmicroFromBQ() {
  const projectId = "selnet-476815";

  const query = `
    SELECT
      NULLIF(LOWER(CAST(hik_code AS STRING)), 'nan') AS hik_code,
      NULLIF(LOWER(CAST(modelo AS STRING)), 'nan') AS modelo,
      NULLIF(LOWER(CAST(descripcion AS STRING)), 'nan') AS descripcion,
      CAST(categoria AS STRING) AS categoria,
      CAST(subcategoria AS STRING) AS subcategoria
    FROM \`${projectId}.pagina.hikmicro\`
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
    modelo: r.f[1]?.v ?? "",
    descripcion: r.f[2]?.v ?? "",
    categoria: r.f[3]?.v ?? "",
    subcategoria: r.f[4]?.v ?? ""
  }));
}

// PAGINA DE HIKVISION ----------------------------------
function getHikvisionFromBQ() {
  const projectId = "selnet-476815";

  // Normalizamos claves por si vienen con .0 / espacios / símbolos
  // ✅ key_hik = solo dígitos desde hik_code
  // ✅ key_mps = solo dígitos desde sap (por si fuera float o string raro)
  const query = `
    WITH hik AS (
      SELECT
        NULLIF(LOWER(CAST(hik_code AS STRING)), 'nan') AS hik_code,
        NULLIF(LOWER(CAST(cod_bejerman AS STRING)), 'nan') AS cod_bejerman,
        NULLIF(LOWER(CAST(modelo AS STRING)), 'nan') AS modelo,
        NULLIF(LOWER(CAST(descripcion AS STRING)), 'nan') AS descripcion,
        CAST(categoria AS STRING) AS categoria,
        CAST(subcategoria AS STRING) AS subcategoria,

        -- clave para mps (solo números)
        REGEXP_REPLACE(CAST(hik_code AS STRING), r'[^0-9]', '') AS key_hik_mps,

        -- clave para stock/transito (alfa-num, sin símbolos)
        REGEXP_REPLACE(LOWER(CAST(cod_bejerman AS STRING)), r'[^0-9a-z]', '') AS key_bej
      FROM \`${projectId}.pagina.hikvision\`
    ),
     -- =========================
    -- OFERTAS (Prioridad 1)
    -- =========================
    ofertas AS (
      SELECT
        REGEXP_REPLACE(CAST(hik_code AS STRING), r'[^0-9]', '') AS key_mps,
        ROUND(SAFE_CAST(gold AS FLOAT64), 2)         AS gold_gremio,
        ROUND(SAFE_CAST(ruby AS FLOAT64), 2)         AS hsphsi_ruby_usd,
        ROUND(SAFE_CAST(pvp AS FLOAT64), 2)          AS map_web_usd_iva,
        CAST(oferta AS STRING)                       AS oferta
      FROM \`${projectId}.pagina.ofertas\`
    ),

    -- =========================
    -- MPS NUEVA (18/09/26)
    -- =========================
    mps_sep AS (
      SELECT
        REGEXP_REPLACE(CAST(sap_code AS STRING), r'[^0-9]', '') AS key_mps,
        ROUND(SAFE_CAST(diamond AS FLOAT64), 2) AS hdn_diamond_titanium_usd,
        ROUND(SAFE_CAST(black AS FLOAT64), 2)   AS hdnhsp_blackusd,
        ROUND(SAFE_CAST(platinum AS FLOAT64), 2) AS hdnhsp_platinum_usd,
        ROUND(SAFE_CAST(ruby AS FLOAT64), 2)    AS hsphsi_ruby_usd,
        ROUND(SAFE_CAST(gold_gremio AS FLOAT64), 2) AS gold_gremio,
        ROUND(SAFE_CAST(map_web_usd_sin_iva AS FLOAT64), 2) AS map_web_usd_iva
      FROM \`${projectId}.pagina.mps_18_09_26\`
    ),

    mps18 AS (
      SELECT
        REGEXP_REPLACE(CAST(sap AS STRING), r'[^0-9]', '') AS key_mps,
        ROUND(SAFE_CAST(hsphsi_ruby_usd AS FLOAT64), 2) AS hsphsi_ruby_usd,
        ROUND(SAFE_CAST(gold_gremio AS FLOAT64), 2) AS gold_gremio,
        ROUND(SAFE_CAST(pvp AS FLOAT64), 2) AS map_web_usd_iva
      FROM \`${projectId}.pagina.mps_18_05_26\`
    ),

    -- =========================
    -- MPS nueva (21/01/26) (Prioridad 2)
    -- =========================
    mps21 AS (
      SELECT
        REGEXP_REPLACE(CAST(sap AS STRING), r'[^0-9]', '') AS key_mps,
        ROUND(SAFE_CAST(hsphsi_ruby_usd AS FLOAT64), 2) AS hsphsi_ruby_usd,
        ROUND(SAFE_CAST(gold_gremio AS FLOAT64), 2) AS gold_gremio,
        ROUND(SAFE_CAST(map_web_usd_iva AS FLOAT64), 2) AS map_web_usd_iva
      FROM \`${projectId}.pagina.mps_21_01_26_2\`
    ),

    -- =========================
    -- MPS vieja (06/08/25) (Prioridad 3)
    -- =========================
    mps06 AS (
      SELECT
        REGEXP_REPLACE(CAST(sap AS STRING), r'[^0-9]', '') AS key_mps,

        -- mapeos tabla vieja
        ROUND(SAFE_CAST(price_ruby    AS FLOAT64), 2) AS hsphsi_ruby_usd,

        ROUND(SAFE_CAST(price_map_web_usd_iva AS FLOAT64), 2) AS map_web_usd_iva,

        CAST(NULL AS FLOAT64) AS gold_gremio
      FROM \`${projectId}.pagina.mps_06_08_25_2\`
    ),

    stock AS (
      SELECT
        REGEXP_REPLACE(LOWER(CAST(Codigo AS STRING)), r'[^0-9a-z]', '') AS key_bej,
        SAFE_CAST(Disponible AS INT64) AS disponible
      FROM \`${projectId}.pagina.stock_ultima_actualizacion\`
    ),

    transito AS (
      SELECT
        REGEXP_REPLACE(LOWER(CAST(bejerman AS STRING)), r'[^0-9a-z]', '') AS key_bej,
        SAFE_CAST(total_en_transito AS FLOAT64) AS total_en_transito
      FROM \`${projectId}.pagina.en_transito\`
    ),

    -- =========================
    -- PRODUCTOS SIN PRECIOS (PSP)
    -- =========================
    psp AS (
      SELECT
        CAST(SAP AS STRING) AS key_sap,
        ROUND(SAFE_CAST(Ruby AS FLOAT64), 2) AS ruby_psp,
        ROUND(SAFE_CAST(Gold_Gremio AS FLOAT64), 2) AS gold_gremio_psp,
        ROUND(SAFE_CAST(PVP AS FLOAT64), 2) AS pvp_psp
      FROM \`${projectId}.pagina.productos_sin_precios\`
      WHERE SAP IS NOT NULL
    )

    SELECT
      hik.hik_code,
      hik.modelo,
      hik.descripcion,

      -- categorías desde tabla base
      hik.categoria,
      hik.subcategoria,

      COALESCE(NULLIF(o.hsphsi_ruby_usd, 0),          NULLIF(m_sep.hsphsi_ruby_usd, 0),          NULLIF(m18.hsphsi_ruby_usd, 0),          NULLIF(m21.hsphsi_ruby_usd, 0),          NULLIF(m06.hsphsi_ruby_usd, 0),          p.ruby_psp)           AS hsphsi_ruby_usd,
      COALESCE(NULLIF(o.gold_gremio, 0),              NULLIF(m_sep.gold_gremio, 0),              NULLIF(m18.gold_gremio, 0),              NULLIF(m21.gold_gremio, 0),              NULLIF(m06.gold_gremio, 0),              p.gold_gremio_psp)    AS gold_gremio,
      COALESCE(NULLIF(o.map_web_usd_iva, 0),          NULLIF(m_sep.map_web_usd_iva, 0),          NULLIF(m18.map_web_usd_iva, 0),          NULLIF(m21.map_web_usd_iva, 0),          NULLIF(m06.map_web_usd_iva, 0),          p.pvp_psp)            AS map_web_usd_iva,

      -- NUEVO: stock
      s.disponible,

      -- NUEVO: transito -> Si/No
      IF(COALESCE(t.total_en_transito, 0) > 0, "Si", "No") AS en_transito,

      -- o.oferta eliminada
      ARRAY_TO_STRING([
        IF(SAFE_CAST(o.hsphsi_ruby_usd AS FLOAT64) > 0, 'hsphsi_ruby_usd', NULL)
      ], ',') AS es_oferta

    FROM hik
    LEFT JOIN ofertas o ON hik.key_hik_mps = o.key_mps
    LEFT JOIN (
      SELECT DISTINCT REGEXP_REPLACE(LOWER(CAST(cod_bejerman AS STRING)), r'[^0-9a-z]', '') AS key_bej
      FROM \`${projectId}.pagina.ofertas\`
      WHERE cod_bejerman IS NOT NULL
    ) ob ON REGEXP_REPLACE(LOWER(CAST(hik.cod_bejerman AS STRING)), r'[^0-9a-z]', '') = ob.key_bej
    LEFT JOIN mps_sep m_sep ON hik.key_hik_mps = m_sep.key_mps
    LEFT JOIN mps18 m18 ON hik.key_hik_mps = m18.key_mps
    LEFT JOIN mps21 m21 ON hik.key_hik_mps = m21.key_mps
    LEFT JOIN mps06 m06 ON hik.key_hik_mps = m06.key_mps
    LEFT JOIN stock s   ON hik.key_bej     = s.key_bej
    LEFT JOIN transito t ON hik.key_bej    = t.key_bej
    LEFT JOIN psp p ON hik.hik_code = p.key_sap
    ORDER BY hik.modelo
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
      modelo: r.f[1]?.v ?? "",
      descripcion: r.f[2]?.v ?? "",
      categoria: r.f[3]?.v ?? "",
      subcategoria: r.f[4]?.v ?? "",
      hsphsi_ruby_usd: r.f[5]?.v ?? "",
      gold_gremio: r.f[6]?.v ?? "",
      map_web_usd_iva: r.f[7]?.v ?? "",
      disponible: r.f[8]?.v ?? "",
      en_transito: r.f[9]?.v ?? "",
      es_oferta: r.f[10]?.v ?? ""
    }));
  }


// PAGINA DE OUTLET ----------------------------------
function getOutletFromBQ() {
  const projectId = "selnet-476815";

  const query = `
    WITH ofertas_cte AS (
      SELECT 
        REGEXP_REPLACE(LOWER(CAST(modelo AS STRING)), r'[^0-9a-z]', '') AS key_mod,
        ARRAY_TO_STRING([
          IF(SAFE_CAST(gold AS FLOAT64) > 0, 'gold', NULL),
          IF(SAFE_CAST(pvp AS FLOAT64) > 0, 'pvp', NULL),
          IF(oferta IS NOT NULL AND oferta != '', 'oferta', NULL)
        ], ',') AS es_oferta,
        oferta
      FROM \`${projectId}.pagina.ofertas\`
      WHERE modelo IS NOT NULL
    )
    SELECT
      t.hik_code,
      t.modelo,
      t.fabricante,
      t.descripcion,
      CAST(t.categoria AS STRING) AS categoria,
      CAST(t.subcategoria AS STRING) AS subcategoria,
      t.gremio,
      t.epp,
      t.iva,
      t.observacion,
      COALESCE(o.es_oferta, '') AS es_oferta
    FROM \`${projectId}.pagina.outlet\` t
    LEFT JOIN ofertas_cte o
      ON REGEXP_REPLACE(LOWER(CAST(t.modelo AS STRING)), r'[^0-9a-z]', '') = o.key_mod
    ORDER BY t.modelo
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
    modelo: r.f[1]?.v ?? "",
    fabricante: r.f[2]?.v ?? "",
    descripcion: r.f[3]?.v ?? "",
    categoria: r.f[4]?.v ?? "",
    subcategoria: r.f[5]?.v ?? "",
    gremio: r.f[6]?.v ?? "",
    epp: r.f[7]?.v ?? "",
    iva: r.f[8]?.v ?? "",
    observacion: r.f[9]?.v ?? "",
    es_oferta: r.f[10]?.v ?? ""
  }));
}

// PAGINA DE RANGER ----------------------------------
function getRangerFromBQ() {
  const projectId = "selnet-476815";

  const query = `
    WITH ofertas_cte AS (
      SELECT 
        REGEXP_REPLACE(LOWER(CAST(modelo AS STRING)), r'[^0-9a-z]', '') AS key_mod,
        ARRAY_TO_STRING([
          IF(SAFE_CAST(gold AS FLOAT64) > 0, 'gold', NULL),
          IF(SAFE_CAST(pvp AS FLOAT64) > 0, 'pvp', NULL),
          IF(oferta IS NOT NULL AND oferta != '', 'oferta', NULL)
        ], ',') AS es_oferta,
        oferta
      FROM \`${projectId}.pagina.ofertas\`
      WHERE modelo IS NOT NULL
    )
    SELECT
      r.modelo,
      r.descripcion,
      CAST(r.categoria AS STRING) AS categoria,
      CAST(r.subcategoria AS STRING) AS subcategoria,
      r.gremio,
      r.cliente_final,
      r.iva,
      COALESCE(o.es_oferta, '') AS es_oferta
    FROM \`${projectId}.pagina.ranger\` r
    LEFT JOIN ofertas_cte o
      ON REGEXP_REPLACE(LOWER(CAST(r.modelo AS STRING)), r'[^0-9a-z]', '') = o.key_mod
    ORDER BY r.modelo
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
    cliente_final: r.f[5]?.v ?? "",
    iva: r.f[6]?.v ?? "",
    es_oferta: r.f[7]?.v ?? ""
  }));
}

// PAGINA DE SEAGATE ----------------------------------
function getSeagateFromBQ() {
  const projectId = "selnet-476815";

  const query = `
    WITH ofertas_cte AS (
      SELECT 
        REGEXP_REPLACE(LOWER(CAST(modelo AS STRING)), r'[^0-9a-z]', '') AS key_mod,
        ARRAY_TO_STRING([
          IF(SAFE_CAST(gold AS FLOAT64) > 0, 'gold', NULL),
          IF(SAFE_CAST(pvp AS FLOAT64) > 0, 'pvp', NULL),
          IF(oferta IS NOT NULL AND oferta != '', 'oferta', NULL)
        ], ',') AS es_oferta,
        oferta
      FROM \`${projectId}.pagina.ofertas\`
      WHERE modelo IS NOT NULL
    )
    SELECT
      NULLIF(LOWER(CAST(s.hik_code AS STRING)), 'nan') AS hik_code,
      NULLIF(LOWER(CAST(s.modelo AS STRING)), 'nan') AS modelo,
      NULLIF(LOWER(CAST(s.descripcion AS STRING)), 'nan') AS descripcion,
      CAST(s.categoria AS STRING) AS categoria,
      CAST(s.subcategoria AS STRING) AS subcategoria,
      ROUND(SAFE_CAST(s.gremio AS FLOAT64), 2) AS gremio,
      ROUND(SAFE_CAST(s.iva AS FLOAT64), 3) AS iva,
      s.pvp, -- Nueva columna 8
      o.oferta, -- Columna 10
      COALESCE(o.es_oferta, '') AS es_oferta -- Columna 11
    FROM \`${projectId}.pagina.seagate\` s
    LEFT JOIN ofertas_cte o
      ON REGEXP_REPLACE(LOWER(CAST(s.modelo AS STRING)), r'[^0-9a-z]', '') = o.key_mod
    ORDER BY s.modelo
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
    hik_code: r.f[0]?.v ?? "",
    modelo: r.f[1]?.v ?? "",
    descripcion: r.f[2]?.v ?? "",
    categoria: r.f[3]?.v ?? "",
    subcategoria: r.f[4]?.v ?? "",
    gremio: r.f[5]?.v ?? "",
    iva: r.f[6]?.v ?? "",
    pvp: r.f[7]?.v ?? "", // Mapeo de PVP
    oferta: r.f[8]?.v ?? "",
    es_oferta: r.f[9]?.v ?? ""
  }));
}

// PAGINA DE TAKEX ----------------------------------
function getTakexFromBQ() {
  const projectId = "selnet-476815";

  const query = `
    WITH ofertas_cte AS (
      SELECT 
        REGEXP_REPLACE(LOWER(CAST(modelo AS STRING)), r'[^0-9a-z]', '') AS key_mod,
        -- Obtenemos el precio de oferta (buscando en gold o gremio)
        COALESCE(SAFE_CAST(gold AS FLOAT64), SAFE_CAST(gremio AS FLOAT64)) AS gremio_off,
        SAFE_CAST(pvp AS FLOAT64) AS pvp_off,
        oferta AS oferta_txt,
        ARRAY_TO_STRING([
          IF(SAFE_CAST(gold AS FLOAT64) > 0 OR SAFE_CAST(gremio AS FLOAT64) > 0, 'gremio', NULL),
          IF(SAFE_CAST(pvp AS FLOAT64) > 0, 'verde_', NULL),
          IF(oferta IS NOT NULL AND oferta != '', 'oferta', NULL)
        ], ',') AS es_oferta
      FROM \`${projectId}.pagina.ofertas\`
      WHERE modelo IS NOT NULL
    )
    SELECT
      t.modelo,
      t.descripcion,
      CAST(t.categoria AS STRING) AS categoria,
      CAST(t.subcategoria AS STRING) AS subcategoria,
      -- Override: Oferta primero, luego tabla base (ahora float)
      ROUND(SAFE_CAST(COALESCE(NULLIF(o.gremio_off, 0), t.gremio) AS FLOAT64), 2) AS gremio,
      ROUND(SAFE_CAST(t.iva AS FLOAT64), 3) AS iva,
      COALESCE(o.oferta_txt, '') AS oferta,
      COALESCE(o.es_oferta, '') AS es_oferta
    FROM \`${projectId}.pagina.takex\` t
    LEFT JOIN ofertas_cte o
      ON REGEXP_REPLACE(LOWER(CAST(t.modelo AS STRING)), r'[^0-9a-z]', '') = o.key_mod
    ORDER BY t.modelo
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

  const query = `
    WITH ofertas_cte AS (
      SELECT 
        REGEXP_REPLACE(LOWER(CAST(modelo AS STRING)), r'[^0-9a-z]', '') AS key_mod,
        ARRAY_TO_STRING([
          IF(SAFE_CAST(gold AS FLOAT64) > 0, 'gold', NULL),
          IF(SAFE_CAST(pvp AS FLOAT64) > 0, 'pvp', NULL),
          IF(oferta IS NOT NULL AND oferta != '', 'oferta', NULL)
        ], ',') AS es_oferta,
        oferta
      FROM \`${projectId}.pagina.ofertas\`
      WHERE modelo IS NOT NULL
    )
    SELECT
      u.modelo,
      u.descripcion,
      u.categoria,
      u.subcategoria,
      u.gremio,
      u.iva,
      u.unidades,
      COALESCE(o.es_oferta, '') AS es_oferta
    FROM \`${projectId}.pagina.ultracell\` u
    LEFT JOIN ofertas_cte o
      ON REGEXP_REPLACE(LOWER(CAST(u.modelo AS STRING)), r'[^0-9a-z]', '') = o.key_mod
    ORDER BY u.modelo
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
    es_oferta: r.f[7]?.v ?? ""
  }));
}

// PAGINA DE VIVOTEK ----------------------------------
function getVivotekFromBQ() {
  const projectId = "selnet-476815";

  const query = `
    WITH vivotek AS (
      SELECT
        NULLIF(LOWER(CAST(cod_bej AS STRING)), 'nan') AS cod_bej,
        NULLIF(LOWER(CAST(modelo AS STRING)), 'nan') AS modelo,
        NULLIF(LOWER(CAST(descripcion AS STRING)), 'nan') AS descripcion,
        categoria,
        subcategoria,
        ROUND(SAFE_CAST(gremio AS FLOAT64), 2) AS gremio,
        ROUND(SAFE_CAST(cliente_final AS FLOAT64), 2) AS cliente_final,
        REGEXP_REPLACE(CAST(cod_bej AS STRING), r'[^0-9a-zA-Z]', '') AS key_cod
      FROM \`${projectId}.pagina.vivotek\`
    ),

    stock AS (
      SELECT
        REGEXP_REPLACE(CAST(Codigo AS STRING), r'[^0-9a-zA-Z]', '') AS key_cod,
        NULLIF(LOWER(CAST(Disponible AS STRING)), 'nan') AS disponible
      FROM \`${projectId}.pagina.stock_ultima_actualizacion\`
    ),

    transito AS (
      SELECT
        REGEXP_REPLACE(CAST(bejerman AS STRING), r'[^0-9a-zA-Z]', '') AS key_cod,
        SAFE_CAST(total_en_transito AS FLOAT64) AS total_en_transito
      FROM \`${projectId}.pagina.en_transito\`
    ),

    ofertas_cte AS (
      SELECT 
        REGEXP_REPLACE(LOWER(CAST(cod_bejerman AS STRING)), r'[^0-9a-z]', '') AS key_bej,
        COALESCE(SAFE_CAST(gold AS FLOAT64), SAFE_CAST(gremio AS FLOAT64)) AS gold_off,
        SAFE_CAST(pvp AS FLOAT64) AS pvp_off,
        ARRAY_TO_STRING([
          IF(SAFE_CAST(gold AS FLOAT64) > 0 OR SAFE_CAST(gremio AS FLOAT64) > 0, 'gold', NULL),
          IF(SAFE_CAST(pvp AS FLOAT64) > 0, 'pvp', NULL),
          IF(oferta IS NOT NULL AND oferta != '', 'oferta', NULL)
        ], ',') AS es_oferta,
        oferta
      FROM \`${projectId}.pagina.ofertas\`
      WHERE cod_bejerman IS NOT NULL
    )

    SELECT
      v.modelo,
      v.descripcion,
      v.categoria,
      v.subcategoria,
      COALESCE(NULLIF(o.gold_off, 0), v.gremio) AS gremio,
      COALESCE(NULLIF(o.pvp_off, 0), v.cliente_final) AS cliente_final,

      s.disponible AS disponible,

      CASE
        WHEN COALESCE(t.total_en_transito, 0) != 0 THEN 'Si'
        ELSE 'No'
      END AS en_transito,
      COALESCE(o.es_oferta, '') AS es_oferta

    FROM vivotek v
    LEFT JOIN stock s
      ON v.key_cod = s.key_cod
    LEFT JOIN transito t
      ON v.key_cod = t.key_cod
    LEFT JOIN ofertas_cte o
      ON REGEXP_REPLACE(LOWER(CAST(v.cod_bej AS STRING)), r'[^0-9a-z]', '') = o.key_bej

    ORDER BY v.modelo
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
    cliente_final: r.f[5]?.v ?? "",
    disponible: r.f[6]?.v ?? "",
    en_transito: r.f[7]?.v ?? "",
    es_oferta: r.f[8]?.v ?? ""
  }));
}

// PAGINA DE VOTEX ----------------------------------
function getVortexFromBQ() {
  const projectId = "selnet-476815";

    const query = `
    SELECT
      NULLIF(LOWER(CAST(modelo AS STRING)), 'nan') AS modelo,
      NULLIF(LOWER(CAST(descripcion AS STRING)), 'nan') AS descripcion,
      CAST(categoria AS STRING) AS categoria,
      CAST(subcategoria AS STRING) AS subcategoria,
      ROUND(SAFE_CAST(gremio AS FLOAT64), 2) AS gremio,
      ROUND(SAFE_CAST(cliente_final AS FLOAT64), 2) AS cliente_final,
      ROUND(SAFE_CAST(iva AS FLOAT64), 3) AS iva
    FROM \`${projectId}.pagina.vortex\`
    ORDER BY pagina, modelo
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
    cliente_final: r.f[5]?.v ?? "",
    iva: r.f[6]?.v ?? ""
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


