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
  t.hik_code,
  UPPER(CAST(t.cod_bejerman AS STRING)) AS cod_bejerman,
  t.modelo,
  t.fabricante,
  t.descripcion,
  CAST(t.categoria AS STRING) AS categoria,
  CAST(t.subcategoria AS STRING) AS subcategoria,
  t.gremio,
  t.epp,
  t.iva,
  t.observacion,
  o.oferta,
  COALESCE(o.es_oferta, '') AS es_oferta
FROM `selnet-476815.pagina.outlet` t
LEFT JOIN ofertas_cte o
  ON NULLIF(NULLIF(NULLIF(REGEXP_REPLACE(LOWER(CAST(t.modelo AS STRING)), r'[^0-9a-z]', ''), ''), 'nan'), 'null') = o.key_mod

  