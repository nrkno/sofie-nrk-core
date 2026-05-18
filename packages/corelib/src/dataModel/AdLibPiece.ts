import { IBlueprintAdLibPiece, SomeContent } from '@sofie-automation/blueprints-integration'
import { RundownId, PartId } from './Ids.js'
import { PieceGeneric } from './Piece.js'
import { CoreUserEditingDefinition, CoreUserEditingProperties } from './UserEditingDefinitions.js'

export interface AdLibPiece extends PieceGeneric, Omit<IBlueprintAdLibPiece, 'content'> {
	/** Rundown this AdLib belongs to */
	rundownId: RundownId

	content: SomeContent

	/** Part this AdLib belongs to */
	partId?: PartId

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
