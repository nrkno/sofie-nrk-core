import { Meteor } from 'meteor/meteor'
import { logger } from '../../logging'
import { PartInstances, PieceInstances, RundownPlaylists } from '../../collections'
import { check } from 'meteor/check'
import { profiler } from '../profiler'
import { QueueForceClearAllCaches, QueueStudioJob } from '../../worker/worker'
import { StudioJobs } from '@sofie-automation/corelib/dist/worker/studio'
import { fetchStudioIds } from '../../optimizations'
import { PeripheralDeviceId, RundownPlaylistId, StudioId } from '@sofie-automation/corelib/dist/dataModel/Ids'
import { insertInputDeviceTriggerIntoPreview } from '../../publications/deviceTriggersPreview'
import { MeteorDebugMethods } from '../../methods'
import { sleep } from '../../lib/lib'

// These are temporary method to fill the rundown database with some sample data
// for development

MeteorDebugMethods({
	/**
	 * Remove a playlist from the system.
	 * This can be done in the ui too, but this will bypass any checks that are usually performed
	 */
	async debug_removePlaylist(id: RundownPlaylistId) {
		logger.debug('Remove rundown "' + id + '"')

		const playlist = await RundownPlaylists.findOneAsync(id)
		if (!playlist) throw new Meteor.Error(404, `RundownPlaylist "${id}" not found`)

		const job = await QueueStudioJob(StudioJobs.RemovePlaylist, playlist.studioId, {
			playlistId: playlist._id,
		})
		await job.complete
	},

	/**
	 * Remove ALL playlists from the system.
	 * Be careful with this, it doesn't care that they might be active
	 */
	async debug_removeAllPlaylists() {
		logger.debug('Remove all rundowns')

		const playlists = await RundownPlaylists.findFetchAsync({})

		await Promise.all(
			playlists.map(async (playlist) => {
				const job = await QueueStudioJob(StudioJobs.RemovePlaylist, playlist.studioId, {
					playlistId: playlist._id,
				})
				await job.complete
			})
		)
	},

	/**
	 * Regenerate the timeline for the specified studio
	 * This will rerun the onTimelineGenerate for your showstyle blueprints, and is particularly useful for debugging that
	 */
	debug_updateTimeline: async (studioId: StudioId) => {
		try {
			check(studioId, String)
			logger.info(`debug_updateTimeline: "${studioId}"`)

			const transaction = profiler.startTransaction('updateTimeline', 'meteor-debug')

			const job = await QueueStudioJob(StudioJobs.UpdateTimeline, studioId, undefined)

			const span = transaction?.startSpan('queued-job')
			await job.complete
			span?.end()

			console.log(await job.getTimings)

			if (transaction) transaction.end()

			logger.info(`debug_updateTimeline: "${studioId}" - done`)
		} catch (e) {
			logger.error(e)
			throw e
		}
	},

	/**
	 * Ensure that the infinite pieces on the nexted-part are correct
	 * Added to debug some issues with infinites not updating
	 */
	async debug_syncPlayheadInfinitesForNextPartInstance(id: RundownPlaylistId) {
		logger.info(`syncPlayheadInfinitesForNextPartInstance ${id}`)

		const playlist = await RundownPlaylists.findOneAsync(id)
		if (!playlist) throw new Error(`RundownPlaylist "${id}" not found`)

		const job = await QueueStudioJob(StudioJobs.DebugSyncInfinitesForNextPartInstance, playlist.studioId, {
			playlistId: id,
		})

		await job.complete
	},

	/**
	 * Clear various caches in the system
	 * Good to run if you suspect a cache is stuck with some stale data
	 */
	async debug_forceClearAllCaches() {
		logger.info('forceClearAllCaches')

		const studioIds = await fetchStudioIds({})
		await QueueForceClearAllCaches(studioIds)
	},

	/**
	 * Remove all 'reset' partisntances and pieceinstances
	 * I don't know when this would be useful
	 */
	async debug_clearAllResetInstances() {
		logger.info('clearAllResetInstances')

		await PartInstances.mutableCollection.removeAsync({ reset: true })
		await PieceInstances.mutableCollection.removeAsync({ reset: true })
	},

	/**
	 * Regenerate the nexted-partinstance from its part.
	 * This can be useful to get ingest updates across when the blueprint syncIngestUpdateToPartInstance method is not implemented, or to bypass that method when it is defined
	 */
	async debug_regenerateNextPartInstance(id: RundownPlaylistId) {
		logger.info('regenerateNextPartInstance')

		const playlist = await RundownPlaylists.findOneAsync(id)
		if (!playlist) throw new Error(`RundownPlaylist "${id}" not found`)

		const job = await QueueStudioJob(StudioJobs.DebugRegenerateNextPartInstance, playlist.studioId, {
			playlistId: id,
		})

		await job.complete
	},

	async debug_previewTrigger(
		peripheralDeviceId: PeripheralDeviceId,
		triggerDeviceId: string,
		triggerId: string,
		values?: Record<string, string | number | boolean>
	) {
		logger.info('previewTrigger')

		await insertInputDeviceTriggerIntoPreview(peripheralDeviceId, triggerDeviceId, triggerId, values)
	},

	async debug_test_logs() {
		logger.info('DEBUGGING LOGS! ====================')
		await sleep(10)
		logger.info('Will start with logging the levels: error, warn, info, debug, verbose, silly:')
		await sleep(10)
		logger.error('This is an error log level')
		await sleep(10)
		logger.warn('This is a warn log level')
		await sleep(10)
		logger.info('This is an info log level')
		await sleep(10)
		logger.debug('This is a debug log level')
		await sleep(10)
		logger.verbose('This is a verbose log level')
		await sleep(10)
		logger.silly('This is a silly log level')
		await sleep(100)

		logger.info('Next up, throwing an uncaught error:')
		await sleep(10)
		setTimeout(() => {
			throw new Error('This is an uncaught error, and should be logged as such')
		}, 10)
		await sleep(100)

		logger.info('Next up, an uncaught promise rejection:')
		await sleep(10)
		setTimeout(() => {
			/* eslint-disable no-unused-vars */
			// @ts-expect-error unused variable
			const _p = new Promise((_resolve, reject) => {
				reject(new Error('This is an uncaught promise rejection, and should be logged as such'))
			})
		}, 10)
		await sleep(100)

		logger.info('Next up, logging a single line using console.log')
		await sleep(10)
		console.log('This is a plain message on stdout!')
		await sleep(10)

		logger.info('Next up, logging a multiline using console.log')
		await sleep(10)
		console.log('This is line 1\nThis is line 2\nThis is line 3')
		await sleep(10)

		logger.info('Next up, logging something using console.error')
		await sleep(10)
		console.error('This is a message on stderr!')
		await sleep(10)

		logger.info('Next up, logging an Error using console.error')
		await sleep(10)
		console.error(new Error('This is my Error, yo!'))
		await sleep(10)

		logger.info(`That's all, folks!`)
		await sleep(10)
		logger.info(`END DEBUGGING LOGS! ====================`)
	},
})
