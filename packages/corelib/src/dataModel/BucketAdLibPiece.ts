import { IBlueprintAdLibPiece, IngestAdlib, SomeContent } from '@sofie-automation/blueprints-integration'
import { BucketAdLibId, BucketId, StudioId, ShowStyleVariantId, ShowStyleBaseId } from './Ids.js'
import { PieceTimelineObjectsBlob } from './Piece.js'
import { RundownImportVersions } from './Rundown.js'
import { CoreUserEditingDefinition, CoreUserEditingProperties } from './UserEditingDefinitions.js'

/**
 * Information used to 'ingest' a Bucket Adlib item
 */
export interface BucketAdLibIngestInfo {
	/**
	 * If set, the adlib should be limited to the specified ShowStyleVariants.
	 * If undefined, the adlib will be generated for all Variants of the ShowStyleBase.
	 */
	limitToShowStyleVariantIds: ShowStyleVariantId[] | undefined
	/**
	 * The ingest payload the Adlib was generated from
	 */
	payload: IngestAdlib
}

export interface BucketAdLib extends Omit<IBlueprintAdLibPiece, 'content'> {
	_id: BucketAdLibId
	bucketId: BucketId

	content: SomeContent

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

	/** Stringified timelineObjects */
	timelineObjectsString: PieceTimelineObjectsBlob

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
