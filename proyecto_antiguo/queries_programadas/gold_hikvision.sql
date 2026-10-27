WITH hik AS (
  SELECT
    NULLIF(LOWER(CAST(hik_code AS STRING)), 'nan') AS hik_code,
    NULLIF(UPPER(CAST(cod_bejerman AS STRING)), 'NAN') AS cod_bejerman,
    NULLIF(LOWER(CAST(modelo AS STRING)), 'nan') AS modelo,
    NULLIF(LOWER(CAST(descripcion AS STRING)), 'nan') AS descripcion,
    CAST(categoria AS STRING) AS categoria,
    CAST(subcategoria AS STRING) AS subcategoria,

    -- clave para mps (solo números)
    REGEXP_REPLACE(CAST(hik_code AS STRING), r'[^0-9]', '') AS key_hik_mps,

    -- clave para stock/transito (alfa-num, sin símbolos). Si es nulo, vacío, 'nan' o 'null' queda NULL
    NULLIF(NULLIF(NULLIF(REGEXP_REPLACE(LOWER(CAST(cod_bejerman AS STRING)), r'[^0-9a-z]', ''), ''), 'nan'), 'null') AS key_bej
  FROM `selnet-476815.pagina.hikvision`
),

-- =========================
-- OFERTAS (Prioridad 1)
-- =========================
ofertas AS (
  SELECT
    REGEXP_REPLACE(CAST(hik_code AS STRING), r'[^0-9]', '') AS key_mps,
    ROUND(SAFE_CAST(gold AS FLOAT64), 2)         AS gold_gremio,
    ROUND(SAFE_CAST(ruby AS FLOAT64), 2)         AS hsphsi_ruby_usd,
    ROUND(SAFE_CAST(dpp_platinum AS FLOAT64), 2) AS hdnhsp_platinum_usd,
    ROUND(SAFE_CAST(dpp_black AS FLOAT64), 2)    AS hdnhsp_blackusd,
    ROUND(SAFE_CAST(dpp_diamond AS FLOAT64), 2)  AS hdn_diamond_titanium_usd,
    ROUND(SAFE_CAST(pvp AS FLOAT64), 2)          AS map_web_usd_iva,
    CAST(oferta AS STRING)                       AS oferta
  FROM `selnet-476815.pagina.ofertas`
),

-- =========================
-- MPS: Precios de lista vigentes consolidados (con fallback automático)
-- =========================
mps AS (
  SELECT
    key_mps,
    diamond_list,
    black_list,
    platinum_list,
    ruby_list,
    gold_gremio_list,
    pvp_list
  FROM `selnet-476815.pagina.mps_precios_vigentes`
),

-- =========================
-- STOCK (Agrupado y filtrado para evitar duplicados o falsos positivos con nan)
-- =========================
stock AS (
  SELECT
    NULLIF(NULLIF(NULLIF(REGEXP_REPLACE(LOWER(CAST(Codigo AS STRING)), r'[^0-9a-z]', ''), ''), 'nan'), 'null') AS key_bej,
    SUM(SAFE_CAST(Disponible AS INT64)) AS disponible
  FROM `selnet-476815.pagina.stock_ultima_actualizacion`
  WHERE Codigo IS NOT NULL AND LOWER(CAST(Codigo AS STRING)) NOT IN ('nan', 'null', '')
  GROUP BY 1
),

-- =========================
-- TRÁNSITO (Agrupado y filtrado para evitar duplicados)
-- =========================
transito AS (
  SELECT
    NULLIF(NULLIF(NULLIF(REGEXP_REPLACE(LOWER(CAST(bejerman AS STRING)), r'[^0-9a-z]', ''), ''), 'nan'), 'null') AS key_bej,
    SUM(SAFE_CAST(total_en_transito AS FLOAT64)) AS total_en_transito
  FROM `selnet-476815.pagina.en_transito`
  WHERE bejerman IS NOT NULL AND LOWER(CAST(bejerman AS STRING)) NOT IN ('nan', 'null', '')
  GROUP BY 1
),

-- =========================
-- PRODUCTOS SIN PRECIOS (PSP)
-- =========================
psp AS (
  SELECT
    CAST(SAP AS STRING) AS key_sap,
    ROUND(SAFE_CAST(Diamond AS FLOAT64), 2) AS diamond_psp,
    ROUND(SAFE_CAST(Black AS FLOAT64), 2) AS black_psp,
    ROUND(SAFE_CAST(Platino AS FLOAT64), 2) AS platinum_psp,
    ROUND(SAFE_CAST(Ruby AS FLOAT64), 2) AS ruby_psp,
    ROUND(SAFE_CAST(Gold_Gremio AS FLOAT64), 2) AS gold_gremio_psp,
    ROUND(SAFE_CAST(PVP AS FLOAT64), 2) AS pvp_psp
  FROM `selnet-476815.pagina.productos_sin_precios`
  WHERE SAP IS NOT NULL
)

SELECT
  hik.hik_code,
  hik.cod_bejerman,
  hik.modelo,
  hik.descripcion,

  -- categorías desde tabla base
  hik.categoria,
  hik.subcategoria,

  COALESCE(NULLIF(o.hdn_diamond_titanium_usd, 0), m.diamond_list,     p.diamond_psp)     AS hdn_diamond_titanium_usd,
  COALESCE(NULLIF(o.hdnhsp_blackusd, 0),          m.black_list,       p.black_psp)       AS hdnhsp_blackusd,
  COALESCE(NULLIF(o.hdnhsp_platinum_usd, 0),      m.platinum_list,    p.platinum_psp)    AS hdnhsp_platinum_usd,
  COALESCE(NULLIF(o.hsphsi_ruby_usd, 0),          m.ruby_list,        p.ruby_psp)        AS hsphsi_ruby_usd,
  COALESCE(NULLIF(o.gold_gremio, 0),              m.gold_gremio_list, p.gold_gremio_psp) AS gold_gremio,
  COALESCE(NULLIF(o.map_web_usd_iva, 0),          m.pvp_list,         p.pvp_psp)         AS map_web_usd_iva,

  -- STOCK
  s.disponible,

  -- TRÁNSITO -> Si/No
  IF(COALESCE(t.total_en_transito, 0) > 0, "Si", "No") AS en_transito,

  o.oferta,
  ARRAY_TO_STRING([
    IF(SAFE_CAST(o.hdn_diamond_titanium_usd AS FLOAT64) > 0, 'hdn_diamond_titanium_usd', NULL),
    IF(SAFE_CAST(o.hdnhsp_blackusd AS FLOAT64) > 0, 'hdnhsp_blackusd', NULL),
    IF(SAFE_CAST(o.hdnhsp_platinum_usd AS FLOAT64) > 0, 'hdnhsp_platinum_usd', NULL),
    IF(SAFE_CAST(o.hsphsi_ruby_usd AS FLOAT64) > 0, 'hsphsi_ruby_usd', NULL),
    IF(SAFE_CAST(o.gold_gremio AS FLOAT64) > 0, 'gold_gremio', NULL),
    IF(SAFE_CAST(o.map_web_usd_iva AS FLOAT64) > 0, 'map_web_usd_iva', NULL),
    IF(o.oferta IS NOT NULL AND o.oferta != '', 'oferta', NULL)
  ], ',') AS es_oferta

FROM hik
LEFT JOIN ofertas o ON hik.key_hik_mps = o.key_mps
LEFT JOIN (
  SELECT DISTINCT NULLIF(NULLIF(NULLIF(REGEXP_REPLACE(LOWER(CAST(cod_bejerman AS STRING)), r'[^0-9a-z]', ''), ''), 'nan'), 'null') AS key_bej
  FROM `selnet-476815.pagina.ofertas`
  WHERE cod_bejerman IS NOT NULL
) ob ON hik.key_bej IS NOT NULL AND hik.key_bej = ob.key_bej
LEFT JOIN mps m ON hik.key_hik_mps = m.key_mps
LEFT JOIN stock s   ON hik.key_bej IS NOT NULL AND hik.key_bej = s.key_bej
LEFT JOIN transito t ON hik.key_bej IS NOT NULL AND hik.key_bej = t.key_bej
LEFT JOIN psp p      ON hik.hik_code = p.key_sap

ORDER BY hik.modelo;
