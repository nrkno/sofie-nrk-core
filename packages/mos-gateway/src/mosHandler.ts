import {
	MosConnection,
	IMOSDevice,
	IMOSConnectionStatus,
	IMOSRunningOrder,
	IMOSROAck,
	IMOSRunningOrderBase,
	IMOSRunningOrderStatus,
	IMOSStoryStatus,
	IMOSItemStatus,
	IMOSStoryAction,
	IMOSROStory,
	IMOSROAction,
	IMOSItemAction,
	IMOSItem,
	IMOSROReadyToAir,
	IMOSROFullStory,
	IConnectionConfig,
	IMOSDeviceConnectionOptions,
	MosDevice,
	IMOSListMachInfo,
	IMOSString128,
	getMosTypes,
	MosTypes,
} from '@mos-connection/connector'

import * as Winston from 'winston'
import { CoreHandler } from './coreHandler'
import { CoreMosDeviceHandler } from './CoreMosDeviceHandler'
import {
	Observer,
	PeripheralDevicePubSubCollectionsNames,
	stringifyError,
} from '@sofie-automation/server-core-integration'
import {
	DEFAULT_MOS_TIMEOUT_TIME,
	DEFAULT_MOS_HEARTBEAT_INTERVAL,
} from '@sofie-automation/shared-lib/dist/core/constants'
import { MosGatewayConfig } from './generated/options'
import { MosDeviceConfig } from './generated/devices'
import { PeripheralDeviceForDevice } from '@sofie-automation/server-core-integration'
import { MosDeviceHandler } from './mosDeviceHandler'
import * as _ from 'underscore'

export interface MosConfig {
	self: IConnectionConfig
	// devices: Array<IMOSDeviceConnectionOptions>
}
export type MosSubDeviceSettings = Record<
	string,
	{
		type: ''
		options: MosDeviceConfig
	}
>

export class MosHandler {
	public mos: MosConnection | undefined

	public mosOptions: MosConfig | undefined
	public debugLogging = false

	private allMosDevices: { [id: string]: { mosDevice: IMOSDevice; coreMosHandler?: CoreMosDeviceHandler } } = {}
	private _ownMosDevices: { [deviceId: string]: MosDeviceHandler } = {}
	private _logger: Winston.Logger
	private _disposed = false
	private _settings?: MosGatewayConfig
	private _openMediaHotStandby: Record<string, boolean>
	private _coreHandler: CoreHandler | undefined
	private _observers: Array<Observer<any>> = []
	private _triggerupdateDevicesTimeout: any = null
	private mosTypes: MosTypes

	constructor(logger: Winston.Logger) {
		this._logger = logger
		this._openMediaHotStandby = {}
		this.mosTypes = getMosTypes(this.strict) // temporary, another will be set upon init()
	}
	async init(config: MosConfig, coreHandler: CoreHandler): Promise<void> {
		this.mosOptions = config
		this._coreHandler = coreHandler
		/*{
			mosID: 'seff-tv-automation',
			acceptsConnections: true, // default:true
			// accepsConnectionsFrom: ['127.0.0.1'],
			profiles: {
				'0': true,
				'1': true,
				'2': true,
				'3': false,
				'4': false,
				'5': false,
				'6': false,
				'7': false
			}
		}
		*/
		if (!coreHandler) {
			throw Error('coreHandler is undefined!')
		}

		if (!coreHandler.core) {
			throw Error('coreHandler.core is undefined!')
		}

		const peripheralDevice = await coreHandler.core.getPeripheralDevice()

		this._settings = peripheralDevice.deviceSettings as any

		this.mosTypes = getMosTypes(this.strict)

		await this._updateDevices()

		if (!this._coreHandler) throw Error('_coreHandler is undefined!')
		this._coreHandler.onConnected(() => {
			// This is called whenever a connection to Core has been (re-)established
			this.setupObservers()
			this.sendStatusOfAllMosDevices()
		})
		this.setupObservers()
	}
	async dispose(): Promise<void> {
		this._disposed = true
		if (this.mos) {
			return this.mos.dispose()
		} else {
			return Promise.resolve()
		}
	}
	setupObservers(): void {
		if (this._observers.length) {
			this._observers.forEach((obs) => {
				obs.stop()
			})
			this._observers = []
		}
		this._logger.info('Renewing observers')

		if (!this._coreHandler) {
			throw Error('_coreHandler is undefined!')
		}

		if (!this._coreHandler.core) {
			throw Error('_coreHandler.core is undefined!')
		}

		const deviceObserver = this._coreHandler.core.observe(
			PeripheralDevicePubSubCollectionsNames.peripheralDeviceForDevice
		)
		deviceObserver.added = () => {
			this._deviceOptionsChanged()
		}
		deviceObserver.changed = () => {
			this._deviceOptionsChanged()
		}
		deviceObserver.removed = () => {
			this._deviceOptionsChanged()
		}
		this._observers.push(deviceObserver)

		this._deviceOptionsChanged()
	}
	debugLog(msg: string, args?: Record<string, string>): void {
		if (this.debugLogging) {
			this._logger.debug(msg, args)
		}
	}
	get strict(): boolean {
		return this._settings?.strict ?? false
	}
	private _deviceOptionsChanged() {
		const peripheralDevice = this.getThisPeripheralDevice()
		if (peripheralDevice) {
			const settings: MosGatewayConfig = (peripheralDevice.deviceSettings || {}) as any
			if (this.debugLogging !== settings.debugLogging) {
				this._logger.info('Changing debugLogging to ' + settings.debugLogging)

				this.debugLogging = !!settings.debugLogging

				if (!this.mos) {
					throw Error('mos is undefined!')
				}
				this.mos.setDebug(this.debugLogging)

				if (settings.debugLogging) {
					this._logger.level = 'debug'
				} else {
					this._logger.level = 'info'
				}
				this._logger.info('log level ' + this._logger.level)
				this._logger.info('test log info')
				console.log('test console.log')
				this._logger.debug('test log debug')
			}
		}
		if (this._triggerupdateDevicesTimeout) {
			clearTimeout(this._triggerupdateDevicesTimeout)
		}
		this._triggerupdateDevicesTimeout = setTimeout(() => {
			this._updateDevices().catch((e) => {
				this._logger.error(e)
			})
		}, 20)
	}
	private async _initMosConnection(): Promise<void> {
		if (this._disposed) return Promise.resolve()
		if (!this._settings) throw Error('Mos-Settings are not set')

		this._logger.info('Initializing MosConnection...')

		if (!this.mosOptions) {
			throw Error('mosOptions is undefined!')
		}

		const connectionConfig: IConnectionConfig = this.mosOptions.self

		if (!this._settings.mosId) throw Error('mosId missing in settings!')
		connectionConfig.mosID = this._settings.mosId

		connectionConfig.strict = this.strict

		connectionConfig.ports = this._settings.ports

		this.mos = new MosConnection(connectionConfig)
		this.mos.on('rawMessage', (source, type, message) => {
			// Filter out heartbeat messages, to reduce log amount:
			if (`${message}`.indexOf('<heartbeat') >= 0) {
				return
			}
			this.debugLog(`rawMessage`, { source, type, rawMessage: message })
		})
		this.mos.on('info', (message) => {
			this._logger.info(message)
		})
		this.mos.on('error', (error) => {
			this._logger.error(stringifyError(error))
		})
		this.mos.on('warning', (warning) => {
			this._logger.error(warning)
		})

		// eslint-disable-next-line @typescript-eslint/no-misused-promises
		this.mos.onConnection(async (mosDevice: IMOSDevice): Promise<void> => {
			// a new connection to a device has been made
			this._logger.info('new mosConnection established: ' + mosDevice.idPrimary + ', ' + mosDevice.idSecondary)
			try {
				this.allMosDevices[mosDevice.idPrimary] = { mosDevice: mosDevice }

				if (!this._coreHandler) throw Error('_coreHandler is undefined!')

				const coreMosHandler = await this._coreHandler.registerMosDevice(mosDevice, this, {
					openMediaHotStandby: mosDevice.idSecondary
						? this._openMediaHotStandby[mosDevice.idSecondary]
						: false,
				})
				// this._logger.info('mosDevice registered -------------')
				// Setup message flow between the devices:

				this.allMosDevices[mosDevice.idPrimary].coreMosHandler = coreMosHandler

				// Initial Status check:
				const connectionStatus = mosDevice.getConnectionStatus()
				coreMosHandler.onMosConnectionChanged(connectionStatus) // initial check
				// Profile 0: -------------------------------------------------
				mosDevice.onConnectionChange((newStatus: IMOSConnectionStatus) => {
					//  MOSDevice >>>> Core
					coreMosHandler.onMosConnectionChanged(newStatus)
				})
				coreMosHandler.onMosConnectionChanged(mosDevice.getConnectionStatus())
				mosDevice.onRequestMachineInfo(async () => {
					// MOSDevice >>>> Core
					return coreMosHandler.getMachineInfo()
				})

				// Profile 1: -------------------------------------------------
				/*
					mosDevice.onRequestMOSObject((objId: string) => {
						// coreMosHandler.fetchMosObject(objId)
						// return Promise<IMOSObject | null>
					})
					*/
				// onRequestMOSObject: (cb: (objId: string) => Promise<IMOSObject | null>) => void
				// onRequestAllMOSObjects: (cb: () => Promise<Array<IMOSObject>>) => void
				// getMOSObject: (objId: string) => Promise<IMOSObject>
				// getAllMOSObjects: () => Promise<Array<IMOSObject>>
				// Profile 2: -------------------------------------------------
				mosDevice.onCreateRunningOrder(async (ro: IMOSRunningOrder) => {
					// MOSDevice >>>> Core
					return this._getROAck(ro.ID, coreMosHandler.mosRoCreate(ro))
				})
				mosDevice.onReplaceRunningOrder(async (ro: IMOSRunningOrder) => {
					// MOSDevice >>>> Core
					return this._getROAck(ro.ID, coreMosHandler.mosRoReplace(ro))
				})
				mosDevice.onDeleteRunningOrder(async (runningOrderId: IMOSString128) => {
					// MOSDevice >>>> Core
					return this._getROAck(runningOrderId, coreMosHandler.mosRoDelete(runningOrderId))
				})
				mosDevice.onMetadataReplace(async (ro: IMOSRunningOrderBase) => {
					// MOSDevice >>>> Core
					return this._getROAck(ro.ID, coreMosHandler.mosRoMetadata(ro))
				})
				mosDevice.onRunningOrderStatus(async (status: IMOSRunningOrderStatus) => {
					// MOSDevice >>>> Core
					return this._getROAck(status.ID, coreMosHandler.mosRoStatus(status))
				})
				mosDevice.onStoryStatus(async (status: IMOSStoryStatus) => {
					// MOSDevice >>>> Core
					return this._getROAck(status.RunningOrderId, coreMosHandler.mosRoStoryStatus(status))
				})
				mosDevice.onItemStatus(async (status: IMOSItemStatus) => {
					// MOSDevice >>>> Core
					return this._getROAck(status.RunningOrderId, coreMosHandler.mosRoItemStatus(status))
				})
				mosDevice.onROInsertStories(async (Action: IMOSStoryAction, Stories: Array<IMOSROStory>) => {
					// MOSDevice >>>> Core
					return this._getROAck(Action.RunningOrderID, coreMosHandler.mosRoStoryInsert(Action, Stories))
				})
				mosDevice.onROInsertItems(async (Action: IMOSItemAction, Items: Array<IMOSItem>) => {
					// MOSDevice >>>> Core
					return this._getROAck(Action.RunningOrderID, coreMosHandler.mosRoItemInsert(Action, Items))
				})
				mosDevice.onROReplaceStories(async (Action: IMOSStoryAction, Stories: Array<IMOSROStory>) => {
					// MOSDevice >>>> Core
					return this._getROAck(Action.RunningOrderID, coreMosHandler.mosRoStoryReplace(Action, Stories))
				})
				mosDevice.onROReplaceItems(async (Action: IMOSItemAction, Items: Array<IMOSItem>) => {
					// MOSDevice >>>> Core
					return this._getROAck(Action.RunningOrderID, coreMosHandler.mosRoItemReplace(Action, Items))
				})
				mosDevice.onROMoveStories(async (Action: IMOSStoryAction, Stories: Array<IMOSString128>) => {
					// MOSDevice >>>> Core
					return this._getROAck(Action.RunningOrderID, coreMosHandler.mosRoStoryMove(Action, Stories))
				})
				mosDevice.onROMoveItems(async (Action: IMOSItemAction, Items: Array<IMOSString128>) => {
					// MOSDevice >>>> Core
					return this._getROAck(Action.RunningOrderID, coreMosHandler.mosRoItemMove(Action, Items))
				})
				mosDevice.onRODeleteStories(async (Action: IMOSROAction, Stories: Array<IMOSString128>) => {
					// MOSDevice >>>> Core
					return this._getROAck(Action.RunningOrderID, coreMosHandler.mosRoStoryDelete(Action, Stories))
				})
				mosDevice.onRODeleteItems(async (Action: IMOSStoryAction, Items: Array<IMOSString128>) => {
					// MOSDevice >>>> Core
					return this._getROAck(Action.RunningOrderID, coreMosHandler.mosRoItemDelete(Action, Items))
				})
				mosDevice.onROSwapStories(
					async (Action: IMOSROAction, StoryID0: IMOSString128, StoryID1: IMOSString128) => {
						// MOSDevice >>>> Core
						return this._getROAck(
							Action.RunningOrderID,
							coreMosHandler.mosRoStorySwap(Action, StoryID0, StoryID1)
						)
					}
				)
				mosDevice.onROSwapItems(
					async (Action: IMOSStoryAction, ItemID0: IMOSString128, ItemID1: IMOSString128) => {
						// MOSDevice >>>> Core
						return this._getROAck(
							Action.RunningOrderID,
							coreMosHandler.mosRoItemSwap(Action, ItemID0, ItemID1)
						)
					}
				)
				mosDevice.onReadyToAir(async (Action: IMOSROReadyToAir) => {
					// MOSDevice >>>> Core
					return this._getROAck(Action.ID, coreMosHandler.mosRoReadyToAir(Action))
				})
				// ----------------------------------------------------------------
				// Init actions
				/*
					mosDevice.getMachineInfo()
						.then((machineInfo: IMOSListMachInfo) => {
						})
					*/
				// Profile 3: -------------------------------------------------
				// Profile 4: -------------------------------------------------
				// onStory: (cb: (story: IMOSROFullStory) => Promise<any>) => void
				mosDevice.onRequestAllRunningOrders(async () => {
					// MOSDevice >>>> Core
					// Not implemented, as Sofie does not support this feature.
					return []
				})
				mosDevice.onRunningOrderStory(async (story: IMOSROFullStory) => {
					// MOSDevice >>>> Core
					return this._getROAck(story.RunningOrderId, coreMosHandler.mosRoFullStory(story))
				})
			} catch (e) {
				this._logger.error('Error:', e)
			}
		})

		// Open mos-server for connections:
		await this.mos.init()
	}
	private sendStatusOfAllMosDevices() {
		// Send an update to Core of the status of all mos devices
		for (const handler of Object.values<{ mosDevice: IMOSDevice; coreMosHandler?: CoreMosDeviceHandler }>(
			this.allMosDevices
		)) {
			if (handler.coreMosHandler) {
				handler.coreMosHandler.onMosConnectionChanged(handler.mosDevice.getConnectionStatus())
			}
		}
	}
	private getThisPeripheralDevice(): PeripheralDeviceForDevice | undefined {
		if (!this._coreHandler) {
			throw Error('_coreHandler is undefined!')
		}

		if (!this._coreHandler.core) {
			throw Error('_coreHandler.core is undefined')
		}

		const peripheralDevices = this._coreHandler.core.getCollection(
			PeripheralDevicePubSubCollectionsNames.peripheralDeviceForDevice
		)
		return peripheralDevices.findOne(this._coreHandler.core.deviceId)
	}
	private async _updateDevices(): Promise<void> {
		if (this._disposed) return
		if (!this.mos) {
			await this._initMosConnection()
		}

		const peripheralDevice = this.getThisPeripheralDevice()

		if (peripheralDevice) {
			const devices: MosSubDeviceSettings = (peripheralDevice.ingestDevices || {}) as any

			const devicesToAdd = new Map<string, MosDeviceConfig>()
			const devicesToRemove = new Set<string>()

			for (const [deviceId, device] of Object.entries<{ options: MosDeviceConfig }>(devices)) {
				if (!device) continue

				const deviceOptions = this.fixUpDeviceOptions(device.options)

				const oldDevice = this._getDevice(deviceId)

				if (!oldDevice) {
					this._logger.info('Initializing new device: ' + deviceId)
					devicesToAdd.set(deviceId, deviceOptions)
				} else {
					if (!_.isEqual(oldDevice.options, deviceOptions)) {
						this._logger.info('Re-initializing device: ' + deviceId)
						devicesToRemove.add(deviceId)
						devicesToAdd.set(deviceId, deviceOptions)
					}
				}
			}

			for (const [deviceId, oldDevice] of Object.entries<MosDeviceHandler>(this._ownMosDevices)) {
				if (oldDevice && !devices[deviceId]) {
					this._logger.info('Un-initializing device: ' + deviceId)
					devicesToRemove.add(deviceId)
				}
			}

			for (const deviceId of devicesToRemove.values()) {
				this._removeDevice(deviceId)
			}
			for (const [deviceId, deviceOptions] of devicesToAdd.entries()) {
				this._addDevice(deviceId, deviceOptions)
			}
		}
	}
	private _addDevice(deviceId: string, deviceOptions: IMOSDeviceConnectionOptions): void {
		if (this._getDevice(deviceId)) return
		if (!this.mos) throw Error('MosHandler: this.mos is undefined, call _initMosConnection first!')

		const mosDeviceHandler = new MosDeviceHandler(this.mos, this._logger, deviceId, deviceOptions)
		this._ownMosDevices[deviceId] = mosDeviceHandler
	}
	private _removeDevice(deviceId: string): void {
		const mosDevice = this._getDevice(deviceId)

		delete this._ownMosDevices[deviceId]
		if (mosDevice) {
			if (!this._coreHandler) throw Error('_coreHandler is undefined!')
			this._coreHandler.unRegisterMosDevice(mosDevice)

			if (!this.mos) {
				throw Error('mos is undefined!')
			}

			// TODO - why are we finding `mosDevice0`, and not using `mosDevice`?
			const mosDevice0 =
				this.mos.getDevice(mosDevice.idPrimary) ||
				(mosDevice.idSecondary && this.mos.getDevice(mosDevice.idSecondary))

			if (mosDevice0) {
				// TODO - does this need running for both primary and secondary?
				this.mos.disposeMosDevice(mosDevice).catch((e) => {
					this._logger.error(`Error when disposing mosDevice "${deviceId}": ${stringifyError(e)}`)
				})
			}
		} else {
			// no device found
		}
	}
	private _getDevice(deviceId: string): MosDeviceHandler | undefined {
		return this._ownMosDevices[deviceId]
	}
	/**
	 * Modify device options, inject some settings etc..
	 */
	private fixUpDeviceOptions(options: MosDeviceConfig): IMOSDeviceConnectionOptions {
		const deviceOptions = JSON.parse(JSON.stringify(options)) // deep clone
		deviceOptions.primary.timeout = deviceOptions.primary.timeout || DEFAULT_MOS_TIMEOUT_TIME
		deviceOptions.primary.heartbeatInterval =
			deviceOptions.primary.heartbeatInterval || DEFAULT_MOS_HEARTBEAT_INTERVAL
		if (deviceOptions.secondary?.id && this._openMediaHotStandby[deviceOptions.secondary.id]) {
			deviceOptions.secondary.openMediaHotStandby = true
		}
		if (deviceOptions.secondary) {
			this._openMediaHotStandby[deviceOptions.secondary.id] =
				deviceOptions.secondary?.openMediaHotStandby || false
			// If the host isn't set, don't use secondary:
			if (!deviceOptions.secondary.host || !deviceOptions.secondary.id) delete deviceOptions.secondary
		}
		return deviceOptions
	}
	private async _getROAck(roId: IMOSString128, p: Promise<any>): Promise<IMOSROAck> {
		return p
			.then(() => {
				const roAck: IMOSROAck = {
					ID: roId,
					Status: this.mosTypes.mosString128.create('OK'),
					Stories: [], // Array<IMOSROAckStory> // todo: implement this later (?) (unknown if we really need to)
				}
				return roAck
			})
			.catch((err) => {
				this._logger.error('ROAck error:', err)
				const roAck: IMOSROAck = {
					ID: roId,
					Status: this.mosTypes.mosString128.create('Error: ' + err.toString()),
					Stories: [], // Array<IMOSROAckStory> // todo: implement this later (?) (unknown if we really need to)
				}
				return roAck
			})
	}
}
