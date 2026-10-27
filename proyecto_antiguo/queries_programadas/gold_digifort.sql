SELECT
      NULLIF(LOWER(CAST(modelo AS STRING)), 'nan') AS modelo,
      NULLIF(LOWER(CAST(descripcion AS STRING)), 'nan') AS descripcion,
      CAST(categoria AS STRING) AS categoria,
      CAST(subcategoria AS STRING) AS subcategoria,
      ROUND(SAFE_CAST(gremio AS FLOAT64), 2) AS gremio,
      ROUND(SAFE_CAST(usuario_final AS FLOAT64), 2) AS usuario_final,
      ROUND(SAFE_CAST(iva AS FLOAT64), 3) AS iva,
      CAST(unidades AS STRING) AS unidades
    FROM `selnet-476815.pagina.digifort`