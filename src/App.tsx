import { useEffect, useState } from 'react'
import mapboxgl, {
	GeoJSONSource,
	LngLat,
	Map,
	MapMouseEvent,
	MapOptions,
} from 'mapbox-gl'
import './App.css'

function App() {
	const mapOptions: MapOptions = {
		container: 'map',
		style: 'mapbox://styles/mapbox/streets-v12',
		center: [-103.59179687498357, 40.66995747013945], // starting position [lng, lat]
		zoom: 2, // starting zoom
	}
	const clusterMaxZoom = 12
	const [map, setMap] = useState<Map | null>(null)

	//Add Icon Images to Map
	const addIconImages = () => {
		if (!map) return
		Array.from({ length: 7 }).forEach(async (_, numberColor) => {
			const imageURL = `/markers/marker-${numberColor}.png`
			map.loadImage(imageURL, (error, image) => {
				if (error) throw error
				if (!image) return
				// Add the loaded image to the style's sprite with the ID 'kitten'.
				map.addImage(numberColor + '-icon', image)
			})
		})
	}

	//Create Layers
	const createLayers = () => {
		if (!map) return

		// Add a GeoJSON source containing place coordinates and information.
		map.addSource('earthquakes', {
			type: 'geojson',
			// Point to GeoJSON data. This example visualizes all M1.0+ earthquakes
			// from 12/22/15 to 1/21/16 as logged by USGS' Earthquake hazards program.
			data: 'https://maplibre.org/maplibre-gl-js/docs/assets/earthquakes.geojson',
			cluster: true,
			clusterMaxZoom: clusterMaxZoom, // Max zoom to cluster points on
			clusterRadius: 50, // Radius of each cluster when clustering points (defaults to 50)
		})
		// Use the earthquakes source to create five layers:
		// One for unclustered points, three for each cluster category,
		// and one for cluster labels.
		map.addLayer({
			id: 'clusters',
			type: 'circle',
			source: 'earthquakes',
			filter: ['has', 'point_count'],
			paint: {
				// Use step expressions (https://maplibre.org/maplibre-style-spec/#expressions-step)
				// with three steps to implement three types of circles:
				//   * Blue, 20px circles when point count is less than 100
				//   * Yellow, 30px circles when point count is between 100 and 750
				//   * Pink, 40px circles when point count is greater than or equal to 750
				'circle-color': [
					'step',
					['get', 'point_count'],
					'#51bbd6',
					100,
					'#f1f075',
					750,
					'#f28cb1',
				],
				'circle-radius': ['step', ['get', 'point_count'], 20, 100, 30, 750, 40],
			},
		})
		map.addLayer({
			id: 'cluster-count',
			type: 'symbol',
			source: 'earthquakes',
			filter: ['has', 'point_count'],
			layout: {
				'text-field': '{point_count_abbreviated}',
				'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
				'text-size': 12,
			},
		})
		map.addLayer({
			id: 'unclustered-point',
			type: 'symbol',
			source: 'earthquakes',
			filter: ['!', ['has', 'point_count']],
			layout: {
				'icon-image': [
					'case',
					['<', ['get', 'mag'], 2],
					'1-icon',
					['<', ['get', 'mag'], 3],
					'2-icon',
					['<', ['get', 'mag'], 4],
					'3-icon',
					['<', ['get', 'mag'], 5],
					'4-icon',
					['<', ['get', 'mag'], 6],
					'5-icon',
					['<', ['get', 'mag'], 7],
					'6-icon',
					['<', ['get', 'mag'], 8],
					'7-icon',
					'0-icon',
				],
				'icon-size': 0.6,
				'icon-allow-overlap': true,
				'icon-ignore-placement': true,
			},
		})
	}

	//Add spiderfyCluster Layer
	const createSpiderFyLayers = () => {
		if (!map) return
		map.addSource('spiderfy', {
			type: 'geojson',
			data: {
				type: 'FeatureCollection',
				features: [],
			},
			cluster: false,
		})
		map.addLayer({
			id: 'unclustered-point-spiderfy',
			type: 'symbol',
			source: 'spiderfy',
			filter: ['!has', 'point_count'],
			layout: {
				'icon-image': [
					'case',
					['<', ['get', 'mag'], 2],
					'1-icon',
					['<', ['get', 'mag'], 3],
					'2-icon',
					['<', ['get', 'mag'], 4],
					'3-icon',
					['<', ['get', 'mag'], 5],
					'4-icon',
					['<', ['get', 'mag'], 6],
					'5-icon',
					['<', ['get', 'mag'], 7],
					'6-icon',
					['<', ['get', 'mag'], 8],
					'7-icon',
					'0-icon',
				],
				'icon-size': 0.6,
				'icon-allow-overlap': true,
				'icon-ignore-placement': true,
				'icon-offset': ['get', 'iconOffset'],
			},
		})
	}

	//Funcion de añadir pointer al mouse
	const mouseEnterLeave = (evt: MapMouseEvent) => {
		if (!map) return
		if (evt.type === 'mouseenter') {
			map.getCanvas().style.cursor = 'pointer'
		} else {
			map.getCanvas().style.cursor = ''
		}
	}

	//Cluster center, zoom and spiderfy
	const centerMapToCluster = async (evt: MapMouseEvent) => {
		if (!map) return
		const features = map.queryRenderedFeatures(evt.point, {
			layers: ['clusters'],
		})

		if (features[0]) {
			//typed as GeoJSONSource to be able to acces to getClusterExpansionZoom
			const source = map.getSource('earthquakes') as GeoJSONSource
			if (!features[0].properties || !source) return

			const clusterId = features[0].properties['cluster_id']
			const lngLat = evt.lngLat
			source.getClusterExpansionZoom(clusterId, (err, zoom) => {
				if (err) return
				if (!zoom) return
				if (zoom > clusterMaxZoom) {
					spiderFyCluster(source, clusterId, lngLat)
					map.easeTo({
						center: lngLat,
					})
				} else {
					map.easeTo({
						center: lngLat,
						zoom: zoom,
					})
				}
			})
		}
	}

	//Funcion para caluclar el offset en circulo de las observaciones
	const calculateSpiderfiedPositionsCircle = (count: number) => {
		const leavesSeparation = 80
		const leavesOffset = [0, 0]
		const points = []
		const theta = (2 * Math.PI) / count
		let angle = theta

		for (let i = 0; i < count; i += 1) {
			angle = theta * i
			const x = leavesSeparation * Math.cos(angle) + leavesOffset[0]
			const y = leavesSeparation * Math.sin(angle) + leavesOffset[1]
			points.push([x, y])
		}
		return points
	}
	//Funcion para caluclar el offset en espiral de las observaciones
	const calculateSpiderfiedPositions = (count: number) => {
		const legLengthStart = 25
		const legLengthFactor = 5
		const leavesSeparation = 40
		const leavesOffset = [0, 0]
		const points = []
		let legLength = legLengthStart
		let angle = 0

		for (let i = 0; i < count; i += 1) {
			angle += leavesSeparation / legLength + i * 0.0005
			const x = legLength * Math.cos(angle) + leavesOffset[0]
			const y = legLength * Math.sin(angle) + leavesOffset[1]
			points.push([x, y])

			legLength += (Math.PI * 2 * legLengthFactor) / angle
		}
		return points
	}

	//Funcion para crear el GEOJSON de los markers spiderfy
	const spiderFyCluster = async (
		source: GeoJSONSource,
		clusterId: number,
		lngLat: LngLat
	) => {
		if (!map) return
		//Consigo todos los markers que el cluster tiene
		source.getClusterLeaves(clusterId, Infinity, 0, (error, features) => {
			// Print cluster leaves in the console
			if (error) return
			if (!features) return
			if (features.length > 0) {
				// Calculate the spiderfied positions
				const spiderfiedPositions =
					features.length > 10
						? calculateSpiderfiedPositions(features.length)
						: calculateSpiderfiedPositionsCircle(features.length)

				// Create a new GeoJson of features with the updated positions
				const geoJson: GeoJSON.GeoJSON = {
					type: 'FeatureCollection',
					features: features.map((feature, index) => ({
						...feature,
						properties: {
							...feature.properties,
							iconOffset: spiderfiedPositions[index],
						},
						geometry: {
							...feature.geometry,
							type: 'Point',
							coordinates: [lngLat.lng, lngLat.lat],
						},
					})),
				}

				//Add them to map
				const spiderfySource = map.getSource('spiderfy') as GeoJSONSource
				spiderfySource.setData(geoJson)

				//Make opacity of clusters
				map.setPaintProperty('clusters', 'circle-opacity', 0.6)
				map.setPaintProperty('unclustered-point', 'icon-opacity', 0.5)
			}
		})
	}

	//Delete Points Spiderfy from spiderfy source
	const deletePointsSpiderfy = () => {
		if (!map) return
		const spiderfySource = map.getSource('spiderfy') as GeoJSONSource
		if (!spiderfySource) return
		spiderfySource.setData({
			type: 'FeatureCollection',
			features: [],
		})
		//Make opacity of clusters get back to normal
		map.setPaintProperty('clusters', 'circle-opacity', 1)
		map.setPaintProperty('unclustered-point', 'icon-opacity', 1)
	}

	useEffect(() => {
		const map = new mapboxgl.Map(mapOptions)
		setMap(map)
	}, [])

	useEffect(() => {
		if (map) {
			map.on('load', () => {
				createLayers()
				createSpiderFyLayers()
				addIconImages()
			})
			map.on('click', 'clusters', async (e) => {
				centerMapToCluster(e)
			})
			map.on('mouseenter', 'clusters', mouseEnterLeave)
			map.on('mouseleave', 'clusters', mouseEnterLeave)

			map.on('zoomstart', deletePointsSpiderfy)
			map.on('touchstart', deletePointsSpiderfy)
		}
	}, [map])

	return (
		<>
			<h1>Spiderfy clusters</h1>
			<div id='map'></div>
			<h3> by Tomas Tubert</h3>
		</>
	)
}

export default App
