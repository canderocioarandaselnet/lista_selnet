-- PRODUCTOS NUEVOS (pagina.productos_nuevos) + ENRIQUECIDO con HOME (match por Bejerman)
WITH
  -- =========================
  -- HIK BASE
  -- =========================
  hik AS (
    SELECT
      CAST(hik_code AS STRING) AS hik_code,
      UPPER(CAST(cod_bejerman AS STRING)) AS cod_bejerman,
      CAST(modelo AS STRING) AS modelo,
      CAST(descripcion AS STRING) AS descripcion,
      CAST(marca AS STRING) AS marca,
      CAST(categoria AS STRING) AS categoria,
      CAST(subcategoria AS STRING) AS subcategoria,
      REGEXP_REPLACE(CAST(hik_code AS STRING), r'[^0-9]', '') AS key_hik_mps,
      REGEXP_REPLACE(LOWER(CAST(cod_bejerman AS STRING)), r'[^0-9a-z]', '') AS key_bej
    FROM `selnet-476815.pagina.hikvision`
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
    FROM `selnet-476815.pagina.ofertas`
  ),

  -- =========================
  -- STOCK Y TRÁNSITO
  -- =========================
  stock AS (
    SELECT
      NULLIF(NULLIF(NULLIF(REGEXP_REPLACE(LOWER(CAST(Codigo AS STRING)), r'[^0-9a-z]', ''), ''), 'nan'), 'null') AS key_bej,
      SUM(SAFE_CAST(Disponible AS INT64)) AS disponible
    FROM `selnet-476815.pagina.stock_ultima_actualizacion`
    WHERE Codigo IS NOT NULL AND LOWER(CAST(Codigo AS STRING)) NOT IN ('nan', 'null', '')
    GROUP BY 1
  ),

  transito AS (
    SELECT
      NULLIF(NULLIF(NULLIF(REGEXP_REPLACE(LOWER(CAST(bejerman AS STRING)), r'[^0-9a-z]', ''), ''), 'nan'), 'null') AS key_bej,
      SUM(SAFE_CAST(total_en_transito AS FLOAT64)) AS total_en_transito
    FROM `selnet-476815.pagina.en_transito`
    WHERE bejerman IS NOT NULL AND LOWER(CAST(bejerman AS STRING)) NOT IN ('nan', 'null', '')
    GROUP BY 1
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
        CAST(h.hik_code AS STRING) AS sap,
        UPPER(CAST(h.cod_bejerman AS STRING)) AS cod_bejerman,
        h.modelo,
        h.descripcion,
        h.marca,
        h.categoria,
        h.subcategoria,
        m.diamond_list,
        m.black_list,
        m.platinum_list,
        m.ruby_list,
        m.gold_gremio_list,
        m.pvp_list,
        NULL AS epp,
        NULL AS iva,
        h.key_bej
      FROM hik h
      LEFT JOIN mps m ON h.key_hik_mps = m.key_mps

      UNION ALL
      -- Digifort
      SELECT NULL, NULL, modelo, descripcion, "DIGIFORT" AS marca, categoria, subcategoria,
        NULL, NULL, NULL, NULL, ROUND(SAFE_CAST(gremio AS FLOAT64), 2), ROUND(SAFE_CAST(usuario_final AS FLOAT64), 2),
        NULL, ROUND(SAFE_CAST(iva AS FLOAT64), 3),
        REGEXP_REPLACE(LOWER(CAST(modelo AS STRING)), r'[^0-9a-z]', '')
      FROM `selnet-476815.pagina.digifort`

      UNION ALL
      -- Ezviz
      SELECT CAST(hik_code AS STRING), UPPER(CAST(cod_bejerman AS STRING)), modelo, descripcion, "EZVIZ" AS marca, categoria, subcategoria,
        NULL, NULL, NULL, NULL, ROUND(SAFE_CAST(gremio AS FLOAT64), 2), NULL,
        ROUND(SAFE_CAST(epp AS FLOAT64), 2), NULL,
        REGEXP_REPLACE(LOWER(CAST(cod_bejerman AS STRING)), r'[^0-9a-z]', '')
      FROM `selnet-476815.pagina.ezviz`

      UNION ALL
      -- Hikmicro
      SELECT CAST(hik_code AS STRING), UPPER(CAST(cod_bejerman AS STRING)), modelo, descripcion, "HIKMICRO" AS marca, categoria, subcategoria,
        NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
        REGEXP_REPLACE(LOWER(CAST(cod_bejerman AS STRING)), r'[^0-9a-z]', '')
      FROM `selnet-476815.pagina.hikmicro`

      UNION ALL
      -- Outlet
      SELECT CAST(hik_code AS STRING), UPPER(CAST(cod_bejerman AS STRING)), modelo, descripcion, "OUTLET" AS marca, categoria, subcategoria,
        NULL, NULL, NULL, NULL, ROUND(SAFE_CAST(gremio AS FLOAT64), 2), NULL,
        ROUND(SAFE_CAST(epp AS FLOAT64), 2), ROUND(SAFE_CAST(iva AS FLOAT64), 3),
        REGEXP_REPLACE(LOWER(CAST(cod_bejerman AS STRING)), r'[^0-9a-z]', '')
      FROM `selnet-476815.pagina.outlet`

      UNION ALL
      -- Ranger
      SELECT NULL, UPPER(CAST(cod_bejerman AS STRING)), modelo, descripcion, "RANGER" AS marca, categoria, subcategoria,
        NULL, NULL, NULL, NULL, ROUND(SAFE_CAST(gremio AS FLOAT64), 2), ROUND(SAFE_CAST(cliente_final AS FLOAT64), 2),
        NULL, ROUND(SAFE_CAST(iva AS FLOAT64), 3),
        REGEXP_REPLACE(LOWER(CAST(cod_bejerman AS STRING)), r'[^0-9a-z]', '')
      FROM `selnet-476815.pagina.ranger`

      UNION ALL
      -- Seagate
      SELECT CAST(hik_code AS STRING), UPPER(CAST(cod_bejerman AS STRING)), modelo, descripcion, "SEAGATE" AS marca, categoria, subcategoria,
        NULL, NULL, NULL, NULL, ROUND(SAFE_CAST(gremio AS FLOAT64), 2), NULL,
        NULL, ROUND(SAFE_CAST(iva AS FLOAT64), 3),
        REGEXP_REPLACE(LOWER(CAST(cod_bejerman AS STRING)), r'[^0-9a-z]', '')
      FROM `selnet-476815.pagina.seagate`

      UNION ALL
      -- Takex
      SELECT NULL, NULL, modelo, descripcion, "TAKEX" AS marca, categoria, subcategoria,
        NULL, NULL, NULL, NULL, ROUND(SAFE_CAST(gremio AS FLOAT64), 2), NULL,
        NULL, ROUND(SAFE_CAST(iva AS FLOAT64), 3),
        REGEXP_REPLACE(LOWER(CAST(modelo AS STRING)), r'[^0-9a-z]', '')
      FROM `selnet-476815.pagina.takex`

      UNION ALL
      -- Ultracell
      SELECT NULL, NULL, modelo, descripcion, "ULTRACELL" AS marca, categoria, subcategoria,
        NULL, NULL, NULL, NULL, ROUND(SAFE_CAST(gremio AS FLOAT64), 2), NULL,
        NULL, ROUND(SAFE_CAST(iva AS FLOAT64), 3),
        REGEXP_REPLACE(LOWER(CAST(modelo AS STRING)), r'[^0-9a-z]', '')
      FROM `selnet-476815.pagina.ultracell`

      UNION ALL
      -- Vivotek
      SELECT NULL, UPPER(CAST(cod_bej AS STRING)), modelo, descripcion, "VIVOTEK" AS marca, categoria, subcategoria,
        NULL, NULL, NULL, NULL, ROUND(SAFE_CAST(gremio AS FLOAT64), 2), ROUND(SAFE_CAST(cliente_final AS FLOAT64), 2),
        NULL, NULL,
        REGEXP_REPLACE(LOWER(CAST(cod_bej AS STRING)), r'[^0-9a-z]', '')
      FROM `selnet-476815.pagina.vivotek`

      UNION ALL
      -- Vortex
      SELECT NULL, UPPER(CAST(cod_bej AS STRING)), modelo, descripcion, "VORTEX" AS marca, categoria, subcategoria,
        NULL, NULL, NULL, NULL, ROUND(SAFE_CAST(gremio AS FLOAT64), 2), ROUND(SAFE_CAST(cliente_final AS FLOAT64), 2),
        NULL, ROUND(SAFE_CAST(iva AS FLOAT64), 3),
        REGEXP_REPLACE(LOWER(CAST(cod_bej AS STRING)), r'[^0-9a-z]', '')
      FROM `selnet-476815.pagina.vortex`
    ) U
    LEFT JOIN ofertas_master O ON U.key_bej = O.key_bej
  ),

  pn AS (
    SELECT
      CAST(marca AS STRING)  AS marca,
      CAST(codigo AS STRING) AS codigo,
      NULLIF(NULLIF(NULLIF(REGEXP_REPLACE(LOWER(CAST(codigo AS STRING)), r'[^0-9a-z]', ''), ''), 'nan'), 'null') AS key_codigo
    FROM `selnet-476815.pagina.productos_nuevos`
    WHERE codigo IS NOT NULL
      AND LOWER(marca) NOT IN ('dsc', 'bentel', 'system sensor', 'bentel - fireclass')
  )

-- =========================
-- RESULTADO FINAL PN
-- =========================
SELECT
  COALESCE(h.marca, pn.marca) AS marca,
  h.sap,
  h.cod_bejerman,
  h.modelo,
  h.descripcion,
  h.categoria,
  h.subcategoria,
  CAST(COALESCE(NULLIF(h.diamond_off, 0), NULLIF(h.diamond_list, 0), P.diamond_psp) AS STRING) AS diamond,
  CAST(COALESCE(NULLIF(h.black_off, 0),   NULLIF(h.black_list, 0),   P.black_psp)   AS STRING) AS black,
  CAST(COALESCE(NULLIF(h.platinum_off, 0), NULLIF(h.platinum_list, 0), P.platinum_psp) AS STRING) AS platinum,
  CAST(COALESCE(NULLIF(h.ruby_off, 0),     NULLIF(h.ruby_list, 0),     P.ruby_psp)     AS STRING) AS ruby,
  SAFE_CAST(COALESCE(NULLIF(h.gold_gremio_off, 0), NULLIF(h.gold_gremio_list, 0), P.gold_gremio_psp) AS FLOAT64) AS gold_gremio,
  SAFE_CAST(COALESCE(NULLIF(h.pvp_off, 0),         NULLIF(h.pvp_list, 0),         P.pvp_psp)         AS FLOAT64) AS pvp,
  SAFE_CAST(COALESCE(NULLIF(h.epp_off, 0),         h.epp)              AS FLOAT64) AS epp,
  h.iva,
  h.oferta_txt AS oferta,
  COALESCE(h.flags, '') AS es_oferta,
  COALESCE(S.disponible, 0) AS disponible,
  IF(COALESCE(T.total_en_transito, 0) > 0, 'Si', 'No') AS en_transito,
  pn.codigo AS codigo_producto_nuevo
FROM pn
LEFT JOIN catalog_unified h ON pn.key_codigo IS NOT NULL AND pn.key_codigo = h.key_bej
LEFT JOIN stock S ON pn.key_codigo IS NOT NULL AND pn.key_codigo = S.key_bej
LEFT JOIN transito T ON pn.key_codigo IS NOT NULL AND pn.key_codigo = T.key_bej
LEFT JOIN psp P ON h.sap IS NOT NULL AND h.sap = P.key_sap
ORDER BY marca, modelo, codigo_producto_nuevo
