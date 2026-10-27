WITH ofertas_cte AS (
  SELECT 
    NULLIF(NULLIF(NULLIF(REGEXP_REPLACE(LOWER(CAST(modelo AS STRING)), r'[^0-9a-z]', ''), ''), 'nan'), 'null') AS key_mod,
    -- Obtenemos el precio de oferta (buscando en gold o gremio)
    COALESCE(SAFE_CAST(gold AS FLOAT64), SAFE_CAST(gremio AS FLOAT64)) AS gremio_off,
    SAFE_CAST(pvp AS FLOAT64) AS pvp_off,
    oferta AS oferta_txt,
    ARRAY_TO_STRING([
      IF(SAFE_CAST(gold AS FLOAT64) > 0 OR SAFE_CAST(gremio AS FLOAT64) > 0, 'gremio', NULL),
      IF(SAFE_CAST(pvp AS FLOAT64) > 0, 'verde_', NULL),
      IF(oferta IS NOT NULL AND oferta != '', 'oferta', NULL)
    ], ',') AS es_oferta
  FROM `selnet-476815.pagina.ofertas`
  WHERE modelo IS NOT NULL AND LOWER(CAST(modelo AS STRING)) NOT IN ('nan', 'null', '')
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
FROM `selnet-476815.pagina.takex` t
LEFT JOIN ofertas_cte o
  ON NULLIF(NULLIF(NULLIF(REGEXP_REPLACE(LOWER(CAST(t.modelo AS STRING)), r'[^0-9a-z]', ''), ''), 'nan'), 'null') = o.key_mod
  