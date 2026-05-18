import { BucketAdLibActionId, BucketId, StudioId, ShowStyleVariantId, ShowStyleBaseId } from './Ids.js'
import { RundownImportVersions } from './Rundown.js'
import { AdLibActionCommon } from './AdlibAction.js'
import { BucketAdLibIngestInfo } from './BucketAdLibPiece.js'
import { CoreUserEditingDefinition, CoreUserEditingProperties } from './UserEditingDefinitions.js'

export interface BucketAdLibAction extends Omit<AdLibActionCommon, 'rundownId'> {
	_id: BucketAdLibActionId
	bucketId: BucketId

	externalId: string

	/**
	 * If an AdLib within the Bucket doesn't match the studioId/showStyleVariantId combination
	 * the adLib will be shown as disabled
	 */
	studioId: StudioId
	/** Which ShowStyleBase the adlib action is valid for */
	showStyleBaseId: ShowStyleBaseId
	/** if showStyleVariantId is null, the adlibAction can be used with any variant */
	showStyleVariantId: ShowStyleVariantId | null
	importVersions: RundownImportVersions // TODO - is this good?
	/** Information used to generate the adlib. If set, this adlib can be regenerated */
	ingestInfo: BucketAdLibIngestInfo | undefined

	/** The following extended interface allows assigning namespace information to the actions as they are stored in the
	 *  database after being emitted from the blueprints
	 */

	/**
	 * User editing definitions for this segment
	 */
	userEditOperations?: CoreUserEditingDefinition[]

	/**
	 * Properties that are user editable from the properties panel in the Sofie UI, if the user saves changes to these
	 * it will trigger a user edit operation of type DefaultUserOperationEditProperties
	 */
	userEditProperties?: CoreUserEditingProperties
}
