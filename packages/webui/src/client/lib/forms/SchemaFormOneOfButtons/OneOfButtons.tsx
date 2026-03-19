import { faQuestionCircle, faSync } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { getSchemaUIField, JSONSchema, SchemaFormUIField } from '@sofie-automation/blueprints-integration'
import { objectPathGet } from '@sofie-automation/corelib/dist/lib'
import classNames from 'classnames'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Button from 'react-bootstrap/Button'
import { useTranslation } from 'react-i18next'
import {
	OverrideOpHelperForItemContents,
	WrappedOverridableItemNormal,
} from '../../../ui/Settings/util/OverrideOpHelper.js'
import { LabelActual, LabelAndOverridesProps } from '../../Components/LabelAndOverrides.js'
import { hasOpWithPath } from '../../Components/util.js'
import { SchemaFormCommonProps, translateStringIfHasNamespaces } from '../schemaFormUtil.js'
import { SchemaFormWithState } from '../SchemaFormWithState.js'
import { TypeName } from '@sofie-automation/shared-lib/src/lib/JSONSchemaTypes.js'
import { values } from 'underscore'

export const OneOfButtonsWithOverrides = (
	props: Readonly<SchemaFormCommonProps> & {
		/** Base path of the schema within the document */
		attr: string

		/** The wrapped item to be edited, with its overrides */
		item: WrappedOverridableItemNormal<any>
		/** Helper to generate and save overrides for the item */
		overrideHelper: OverrideOpHelperForItemContents
	}
) => {
	const { t } = useTranslation()

	const childProps = useMemo(() => {
		const title = getSchemaUIField(props.schema, SchemaFormUIField.Title) || props.schema.title || props.attr
		const description = getSchemaUIField(props.schema, SchemaFormUIField.Description)

		return {
			schema: props.schema,
			translationNamespaces: props.translationNamespaces,
			commonAttrs: {
				label: translateStringIfHasNamespaces(title, props.translationNamespaces),
				hint: description ? translateStringIfHasNamespaces(description, props.translationNamespaces) : undefined,
				item: props.item,
				itemKey: props.attr,
				overrideHelper: props.overrideHelper,

				showClearButton: !!props.showClearButtonForNonRequiredFields && !props.isRequired,
			},
			isRequired: props.isRequired,
		}
	}, [
		props.schema,
		props.translationNamespaces,
		props.attr,
		props.item,
		props.overrideHelper,
		props.isRequired,
		props.showClearButtonForNonRequiredFields,
	])

	const discProperty = getSchemaUIField(props.schema, SchemaFormUIField.OneOfDiscriminant)

	if (!discProperty) {
		return (
			<p>
				{t('Property "{{ propLabel }}" does not have a discriminant property specified for variants', {
					propLabel: childProps.commonAttrs.label,
				})}
			</p>
		)
	}

	if (!props.schema.oneOf) {
		return (
			<p>
				{t('Property "{{ propLabel }}" does not have oneOf variants declared', {
					propLabel: childProps.commonAttrs.label,
				})}
			</p>
		)
	}

	const invalidVariantIndex = props.schema.oneOf.findIndex((variant) => variant.type !== TypeName.Object || variant.properties?.[discProperty].const === undefined)
	if (invalidVariantIndex >= 0) {
		return (
			<p>
				{t('Property "{{ propLabel }}" has a variant at index {{ index }} that is not an object and/or does not specify a discriminant', {
					propLabel: childProps.commonAttrs.label,
					index: invalidVariantIndex
				})}
			</p>
		)
	}

	return (
		<LabelAndOverridesForOneOfButtons {...childProps.commonAttrs}>
			{(_value, _handleUpdate) =>
				props.schema.oneOf &&
				props.schema.oneOf.map((variant, index) => {
					const type = variant.properties?.[discProperty]?.const
					if (type === undefined)
						return (
							<p>
								{t(
									'Discriminant property "{{ discProperty }}" used, but is undefined for variant at index {{ index }}',
									{
										discProperty,
										index,
									}
								)}
							</p>
						)

					return (
						<OneOfVariantButtonComplex key={`${index}_${type}`} discProperty={discProperty} schema={variant} translationNamespaces={props.translationNamespaces} />
					)
				})
			}
		</LabelAndOverridesForOneOfButtons>
	)
}

function OneOfVariantButtonComplex({
	schema,
	discProperty,
	translationNamespaces
}: Readonly<{
	discProperty: string
	schema: JSONSchema<any, JSONSchema.TypeValue>
	translationNamespaces: string[]
}>): JSX.Element {
	const [editingValue, setEditingValue] = useState<Record<string, any> | null>({})

	const typeValue = schema.properties?.[discProperty]?.const

	useEffect(() => {
		setEditingValue((val) => ({
			...val,
			[discProperty]: typeValue,
		}))
	}, [discProperty, typeValue])
	
	const variantTitle = getSchemaUIField(schema, SchemaFormUIField.Title)

	const onUpdate = useCallback((update: Record<string, any>) => {
		setEditingValue(() => ({
			...update,
		}))
	}, [])

	return (
		<label>
			<Button variant="outline-primary">{variantTitle}</Button>
			<SchemaFormWithState
				object={editingValue}
				schema={
					{
						...schema,
						// we don't need to display a title for the variant, it's already titled by the button
						[SchemaFormUIField.Title]: undefined,
					} as any
				}
				onUpdate={onUpdate}
				translationNamespaces={translationNamespaces}
				allowTables={false}
				showClearButtonForNonRequiredFields={true}
			/>
		</label>
	)
}

function LabelAndOverridesForOneOfButtons<T extends object, TValue = any>({
	children,
	label,
	hint,
	item,
	itemKey,
	overrideHelper,
	showClearButton,
	formatDefaultValue,
}: Readonly<LabelAndOverridesProps<T, TValue>>): JSX.Element {
	const { t } = useTranslation()

	const clearOverride = useCallback(() => {
		overrideHelper().clearItemOverrides(item.id, String(itemKey)).commit()
	}, [overrideHelper, item.id, itemKey])
	const setValue = useCallback(
		(newValue: any) => {
			overrideHelper().setItemValue(item.id, String(itemKey), newValue).commit()
		},
		[overrideHelper, item.id, itemKey]
	)

	const isOverridden = hasOpWithPath(item.overrideOps, item.id, String(itemKey))

	let displayValue: JSX.Element | string | null = '""'
	if (item.defaults) {
		const defaultValue: any = objectPathGet(item.defaults, String(itemKey))
		// Special cases for formatting of the default
		if (formatDefaultValue) {
			displayValue = formatDefaultValue(defaultValue)
		} else if (defaultValue === false) {
			displayValue = 'false'
		} else if (defaultValue === true) {
			displayValue = 'true'
		} else if (!defaultValue) {
			displayValue = ''
		} else if (Array.isArray(defaultValue) || typeof defaultValue === 'object') {
			displayValue = JSON.stringify(defaultValue) || ''
		} else {
			// Display it as a string
			displayValue = `${defaultValue}`
		}
	}

	const value = objectPathGet(item.computed, String(itemKey))

	return (
		<div className="field">
			<LabelActual label={label} />

			<div
				className={classNames('field-content', {
					'checkbox-enable-before': showClearButton,
				})}
			>
				{showClearButton && (
					<Button
						variant="primary"
						className="field-clear"
						onClick={() => setValue(undefined)}
						title={t('Clear value')}
					>
						<FontAwesomeIcon icon={faSync} />
					</Button>
				)}

				{children(value, setValue)}
			</div>

			{item.defaults && (
				<>
					<span className="field-default">
						{displayValue === null ? (
							<FontAwesomeIcon icon={faQuestionCircle} title={`${t('Default')}: null`} />
						) : typeof displayValue === 'object' ? (
							displayValue
						) : (
							<FontAwesomeIcon icon={faQuestionCircle} title={`${t('Default')}: ${displayValue}`} />
						)}
					</span>
					<Button variant="primary" onClick={clearOverride} title="Reset to default" disabled={!isOverridden}>
						<span>{t('Reset')}</span>
						<FontAwesomeIcon icon={faSync} />
					</Button>
				</>
			)}

			{hint && <span className="text-s dimmed field-hint">{hint}</span>}
		</div>
	)
}