import { IMOSDeviceConnectionOptions, IMOSListMachInfo, MosConnection, MosDevice } from '@mos-connection/connector'
import { stringifyError } from '@sofie-automation/server-core-integration'
import * as Winston from 'winston'

export class MosDeviceHandler {
	mosDevice: MosDevice | undefined = undefined
	machineInfo: IMOSListMachInfo | undefined = undefined

	checkStatusInterval: NodeJS.Timeout | undefined = undefined

	constructor(
		private mos: MosConnection,
		private logger: Winston.Logger,
		public readonly deviceId: string,
		public readonly options: IMOSDeviceConnectionOptions
	) {
		// Reconnection loop:
		this.checkStatusInterval = setInterval(() => {
			this.monitorConnection()
		}, 60 * 1000)
		this.monitorConnection()
	}
	private monitorConnection() {
		// This is called on an interval
		this._monitorConnection().catch((e) => {
			this.logger.warn(`Error in monitorConnection: ${stringifyError(e)}`)
		})
	}
	private async _monitorConnection(): Promise<void> {
		// This is called on an interval

		if (!this.mosDevice) {
			this.machineInfo = undefined
			// Initialize connection:
			try {
				this.mosDevice = await this.mos.connect(this.options)
			} catch (e) {
				this.logger.warn(`Failed to connect to MOS device "${this.deviceId}": ${stringifyError(e)}`)
			}
		}
		if (!this.mosDevice) return

		if (!this.machineInfo) {
			// Establish initial info:
			try {
				this.machineInfo = await this.mosDevice.requestMachineInfo()
			} catch (e) {
				if (
					e &&
					((e + '').match(/no connection available for failover/i) || (e + '').match(/failover connection/i))
				) {
					// Not connected, swallow error silently
					// (mos.connect resolves too soon, before the connection is actually initialized)
				} else {
					this.logger.warn(
						`Failed to get machine info from MOS device "${this.deviceId}": ${stringifyError(e)}`
					)
				}
			}
		}
	}

	private getStatus() {}
}
