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
  -- Hikvision con precios de lista MPS
  -- =========================
  hik_base_prices AS (
    SELECT
      h.*,
      m.diamond_list,
      m.black_list,
      m.platinum_list,
      m.ruby_list,
      m.gold_gremio_list,
      m.pvp_list
    FROM hik h
    LEFT JOIN mps m ON h.key_hik_mps = m.key_mps
  ),

  -- =========================
  -- OFERTAS MASTER: Override de precios + Flags
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
  -- UNIFICACIÓN DE TODAS LAS FUENTES
  -- =========================
  unified_catalog AS (
    SELECT
      CAST(hik_code AS STRING) AS sap,
      UPPER(CAST(cod_bejerman AS STRING)) AS cod_bejerman,
      modelo, descripcion, marca, categoria, subcategoria,
      diamond_list AS diamond, black_list AS black, platinum_list AS platinum, ruby_list AS ruby,
      gold_gremio_list AS gold_gremio, pvp_list AS pvp,
      NULL AS epp, NULL AS iva,
      key_bej
    FROM hik_base_prices

    UNION ALL
    SELECT NULL, NULL, modelo, descripcion, "DIGIFORT" AS marca, categoria, subcategoria,
      NULL, NULL, NULL, NULL, ROUND(SAFE_CAST(gremio AS FLOAT64), 2), ROUND(SAFE_CAST(usuario_final AS FLOAT64), 2),
      NULL, ROUND(SAFE_CAST(iva AS FLOAT64), 3),
      REGEXP_REPLACE(LOWER(CAST(modelo AS STRING)), r'[^0-9a-z]', '')
    FROM `selnet-476815.pagina.digifort`

    UNION ALL
    SELECT CAST(hik_code AS STRING), UPPER(CAST(cod_bejerman AS STRING)), modelo, descripcion, "EZVIZ" AS marca, categoria, subcategoria,
      NULL, NULL, NULL, NULL, ROUND(SAFE_CAST(gremio AS FLOAT64), 2), NULL,
      ROUND(SAFE_CAST(epp AS FLOAT64), 2), NULL,
      REGEXP_REPLACE(LOWER(CAST(cod_bejerman AS STRING)), r'[^0-9a-z]', '')
    FROM `selnet-476815.pagina.ezviz`

    UNION ALL
    SELECT CAST(hik_code AS STRING), UPPER(CAST(cod_bejerman AS STRING)), modelo, descripcion, "HIKMICRO" AS marca, categoria, subcategoria,
      NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
      REGEXP_REPLACE(LOWER(CAST(cod_bejerman AS STRING)), r'[^0-9a-z]', '')
    FROM `selnet-476815.pagina.hikmicro`

    UNION ALL
    SELECT CAST(hik_code AS STRING), UPPER(CAST(cod_bejerman AS STRING)), modelo, descripcion, "OUTLET" AS marca, categoria, subcategoria,
      NULL, NULL, NULL, NULL, ROUND(SAFE_CAST(gremio AS FLOAT64), 2), NULL,
      ROUND(SAFE_CAST(epp AS FLOAT64), 2), ROUND(SAFE_CAST(iva AS FLOAT64), 3),
      REGEXP_REPLACE(LOWER(CAST(cod_bejerman AS STRING)), r'[^0-9a-z]', '')
    FROM `selnet-476815.pagina.outlet`

    UNION ALL
    SELECT NULL, UPPER(CAST(cod_bejerman AS STRING)), modelo, descripcion, "RANGER" AS marca, categoria, subcategoria,
      NULL, NULL, NULL, NULL, ROUND(SAFE_CAST(gremio AS FLOAT64), 2), ROUND(SAFE_CAST(cliente_final AS FLOAT64), 2),
      NULL, ROUND(SAFE_CAST(iva AS FLOAT64), 3),
      REGEXP_REPLACE(LOWER(CAST(cod_bejerman AS STRING)), r'[^0-9a-z]', '')
    FROM `selnet-476815.pagina.ranger`

    UNION ALL
    SELECT CAST(hik_code AS STRING), UPPER(CAST(cod_bejerman AS STRING)), modelo, descripcion, "SEAGATE" AS marca, categoria, subcategoria,
      NULL, NULL, NULL, NULL, ROUND(SAFE_CAST(gremio AS FLOAT64), 2), NULL,
      NULL, ROUND(SAFE_CAST(iva AS FLOAT64), 3),
      REGEXP_REPLACE(LOWER(CAST(cod_bejerman AS STRING)), r'[^0-9a-z]', '')
    FROM `selnet-476815.pagina.seagate`

    UNION ALL
    SELECT NULL, NULL, modelo, descripcion, "TAKEX" AS marca, categoria, subcategoria,
      NULL, NULL, NULL, NULL, ROUND(SAFE_CAST(gremio AS FLOAT64), 2), NULL,
      NULL, ROUND(SAFE_CAST(iva AS FLOAT64), 3),
      REGEXP_REPLACE(LOWER(CAST(modelo AS STRING)), r'[^0-9a-z]', '')
    FROM `selnet-476815.pagina.takex`

    UNION ALL
    SELECT NULL, NULL, modelo, descripcion, "ULTRACELL" AS marca, categoria, subcategoria,
      NULL, NULL, NULL, NULL, ROUND(SAFE_CAST(gremio AS FLOAT64), 2), NULL,
      NULL, ROUND(SAFE_CAST(iva AS FLOAT64), 3),
      REGEXP_REPLACE(LOWER(CAST(modelo AS STRING)), r'[^0-9a-z]', '')
    FROM `selnet-476815.pagina.ultracell`

    UNION ALL
    SELECT NULL, UPPER(CAST(cod_bej AS STRING)), modelo, descripcion, "VIVOTEK" AS marca, categoria, subcategoria,
      NULL, NULL, NULL, NULL, ROUND(SAFE_CAST(gremio AS FLOAT64), 2), ROUND(SAFE_CAST(cliente_final AS FLOAT64), 2),
      NULL, NULL,
      REGEXP_REPLACE(LOWER(CAST(cod_bej AS STRING)), r'[^0-9a-z]', '')
    FROM `selnet-476815.pagina.vivotek`

    UNION ALL
    SELECT NULL, UPPER(CAST(cod_bej AS STRING)), modelo, descripcion, "VORTEX" AS marca, categoria, subcategoria,
      NULL, NULL, NULL, NULL, ROUND(SAFE_CAST(gremio AS FLOAT64), 2), ROUND(SAFE_CAST(cliente_final AS FLOAT64), 2),
      NULL, ROUND(SAFE_CAST(iva AS FLOAT64), 3),
      REGEXP_REPLACE(LOWER(CAST(cod_bej AS STRING)), r'[^0-9a-z]', '')
    FROM `selnet-476815.pagina.vortex`
  )

-- =========================
-- SELECT FINAL
-- =========================
SELECT
  CAST(U.sap AS STRING)           AS sap,
  CAST(U.cod_bejerman AS STRING)  AS cod_bejerman,
  CAST(U.modelo AS STRING)        AS modelo,
  CAST(U.descripcion AS STRING)   AS descripcion,
  CAST(U.marca AS STRING)         AS marca,
  CAST(U.categoria AS STRING)     AS categoria,
  CAST(U.subcategoria AS STRING)  AS subcategoria,

  CAST(COALESCE(NULLIF(O.diamond_off, 0),  NULLIF(U.diamond, 0), P.diamond_psp) AS STRING) AS diamond,
  CAST(COALESCE(NULLIF(O.black_off, 0),    NULLIF(U.black, 0), P.black_psp)   AS STRING) AS black,
  CAST(COALESCE(NULLIF(O.platinum_off, 0), NULLIF(U.platinum, 0), P.platinum_psp) AS STRING) AS platinum,
  CAST(COALESCE(NULLIF(O.ruby_off, 0),     NULLIF(U.ruby, 0), P.ruby_psp)     AS STRING) AS ruby,
  SAFE_CAST(COALESCE(NULLIF(O.gold_gremio_off, 0), NULLIF(U.gold_gremio, 0), P.gold_gremio_psp) AS FLOAT64) AS gold_gremio,
  SAFE_CAST(COALESCE(NULLIF(O.pvp_off, 0),         NULLIF(U.pvp, 0), P.pvp_psp)         AS FLOAT64) AS pvp,
  
  SAFE_CAST(COALESCE(NULLIF(O.epp_off, 0),         U.epp)         AS FLOAT64) AS epp,
  SAFE_CAST(U.iva AS FLOAT64)         AS iva,
  CAST(O.oferta_txt AS STRING)        AS oferta,
  COALESCE(O.flags, '')               AS es_oferta,

  COALESCE(S.disponible, 0)           AS disponible,
  IF(COALESCE(T.total_en_transito, 0) > 0, 'Si', 'No') AS en_transito

FROM unified_catalog U
LEFT JOIN ofertas_master O 
  ON (U.key_bej IS NOT NULL AND U.key_bej = O.key_bej)
  OR (U.key_bej IS NULL AND REGEXP_REPLACE(LOWER(CAST(U.modelo AS STRING)), r'[^0-9a-z]', '') = O.key_mod)
LEFT JOIN stock S ON U.key_bej IS NOT NULL AND U.key_bej NOT IN ('', 'nan', 'null') AND U.key_bej = S.key_bej
LEFT JOIN transito T ON U.key_bej IS NOT NULL AND U.key_bej NOT IN ('', 'nan', 'null') AND U.key_bej = T.key_bej
LEFT JOIN psp P ON U.sap = P.key_sap

ORDER BY marca, modelo