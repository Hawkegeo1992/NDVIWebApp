exports.handler = async function(event, context) {
  try {
    const body = JSON.parse(event.body || '{}');
    const { year, month, week, index } = body;

    if (!year || !month || !week || !index) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing parameters' })
      };
    }

    // اتصال به Earth Engine
    const ee = require('@google/earthengine');
    const fs = require('fs');
    const path = require('path');

    const privateKey = JSON.parse(
      fs.readFileSync(path.join(__dirname, 'ee-hawkegeo-e9790f81bfd7.json'))
    );

    await new Promise((resolve, reject) => {
      ee.data.authenticateViaPrivateKey(privateKey, () => {
        ee.initialize(null, null, resolve, reject);
      }, reject);
    });

    const geometry = ee.FeatureCollection("users/hawkegeo/ahwaz");

    const weekNumber = ee.Number.parse(week);
    const startDate = ee.Date.fromYMD(Number(year), Number(month), 1).advance(weekNumber.subtract(1).multiply(7), 'day');
    const endDate = startDate.advance(6, 'day');

    const collection = ee.ImageCollection("COPERNICUS/S2")
      .filterBounds(geometry)
      .filterDate(startDate, endDate)
      .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 30))
      .qualityMosaic('B8');

    const image = ee.Image(collection);

    let indexImage;
    if (index === 'NDVI') {
      indexImage = image.normalizedDifference(['B8', 'B4']).rename('NDVI');
    } else if (index === 'SAVI') {
      indexImage = image.expression(
        '((NIR - RED) / (NIR + RED + L)) * (1 + L)',
        {
          'NIR': image.select('B8'),
          'RED': image.select('B4'),
          'L': 0.5
        }).rename('SAVI');
    } else {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Index not supported in backend yet' })
      };
    }

    indexImage = indexImage.clip(geometry);
    const mean = await indexImage.reduceRegion({
      reducer: ee.Reducer.mean(),
      geometry: geometry.geometry(),
      scale: 10,
      maxPixels: 1e9
    }).getInfo();

    return {
      statusCode: 200,
      body: JSON.stringify({
        index: index,
        meanValue: mean[index],
        year,
        month,
        week
      })
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
