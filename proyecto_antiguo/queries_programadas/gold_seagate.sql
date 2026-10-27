WITH ofertas_cte AS (
  SELECT 
    NULLIF(NULLIF(NULLIF(REGEXP_REPLACE(LOWER(CAST(modelo AS STRING)), r'[^0-9a-z]', ''), ''), 'nan'), 'null') AS key_mod,
    ARRAY_TO_STRING([
      IF(SAFE_CAST(gold AS FLOAT64) > 0, 'gold', NULL),
      IF(SAFE_CAST(pvp AS FLOAT64) > 0, 'pvp', NULL),
      IF(oferta IS NOT NULL AND oferta != '', 'oferta', NULL)
    ], ',') AS es_oferta,
    oferta
  FROM `selnet-476815.pagina.ofertas`
  WHERE modelo IS NOT NULL AND LOWER(CAST(modelo AS STRING)) NOT IN ('nan', 'null', '')
)
SELECT
  NULLIF(LOWER(CAST(s.hik_code AS STRING)), 'nan') AS hik_code,
  NULLIF(UPPER(CAST(s.cod_bejerman AS STRING)), 'NAN') AS cod_bejerman,
  NULLIF(LOWER(CAST(s.modelo AS STRING)), 'nan') AS modelo,
  NULLIF(LOWER(CAST(s.descripcion AS STRING)), 'nan') AS descripcion,
  CAST(s.categoria AS STRING) AS categoria,
  CAST(s.subcategoria AS STRING) AS subcategoria,
  ROUND(SAFE_CAST(s.gremio AS FLOAT64), 2) AS gremio,
  ROUND(SAFE_CAST(s.iva AS FLOAT64), 3) AS iva,
  s.pvp, -- Nueva columna 8
  s.dpp_platinum, -- Nueva columna 9
  o.oferta, -- Columna 10
  COALESCE(o.es_oferta, '') AS es_oferta -- Columna 11
FROM `selnet-476815.pagina.seagate` s
LEFT JOIN ofertas_cte o
  ON NULLIF(NULLIF(NULLIF(REGEXP_REPLACE(LOWER(CAST(s.modelo AS STRING)), r'[^0-9a-z]', ''), ''), 'nan'), 'null') = o.key_mod
  