import type { AnyDataModel } from "../dataModel/BaseDataModel"
import type { AnyModel } from "../model/BaseModel"
import type { modelTypeKey } from "../model/metadata"
import type { Flatten, IsNeverType } from "../utils/types"
import type {
  ModelPropsToSnapshotCreationData,
  ModelPropsToSnapshotData,
  ModelPropsToTransformedCreationData,
  ModelPropsToTransformedData,
  ModelPropsToUntransformedCreationData,
} from "./prop"

/**
 * @ignore
 */
export const propsTypeSymbol = Symbol("propsType")

/**
 * @ignore
 */
export const fromSnapshotOverrideTypeSymbol = Symbol("fromSnapshotOverrideType")

/**
 * @ignore
 */
export const toSnapshotOverrideTypeSymbol = Symbol("toSnapshotOverrideType")

/**
 * @internal
 */
export const modelInitializedSymbol = Symbol("modelInitialized")

/**
 * Extracts the instance type of a model class.
 */
export type ModelClass<M extends AnyModel | AnyDataModel> = {
  new (initialData: any): M

  fromSnapshotProcessor?(sn: any): any
  toSnapshotProcessor?(sn: any, modelInstance: any): any
}

/**
 * Extracts the instance type of an abstract model class.
 */
export type AbstractModelClass<M extends AnyModel | AnyDataModel> = abstract new (
  initialData: any
) => M

/**
 * The props of a model.
 */
export type ModelPropsOf<M extends AnyModel | AnyDataModel> = M[typeof propsTypeSymbol]

/**
 * The data type of a model, without transformations applied.
 */
export type ModelUntransformedData<M extends AnyModel | AnyDataModel> = Flatten<M["$"]>

/**
 * The creation data type of a model, without transformations applied.
 */
export type ModelUntransformedCreationData<M extends AnyModel | AnyDataModel> =
  ModelPropsToUntransformedCreationData<ModelPropsOf<M>>

/**
 * The data type of a model, with transformations applied.
 */
export type ModelData<M extends AnyModel | AnyDataModel> = ModelPropsToTransformedData<
  ModelPropsOf<M>
>

/**
 * The creation data type of a model, with transformations applied.
 */
export type ModelCreationData<M extends AnyModel | AnyDataModel> =
  ModelPropsToTransformedCreationData<ModelPropsOf<M>>

/**
 * The from snapshot type of a model.
 *
 * @deprecated Use SnapshotInOf<Model> instead.
 */
export type ModelFromSnapshot<M extends AnyModel> = IsNeverType<
  M[typeof fromSnapshotOverrideTypeSymbol],
  ModelPropsToSnapshotCreationData<ModelPropsOf<M>>,
  M[typeof fromSnapshotOverrideTypeSymbol]
> & { [modelTypeKey]?: string }

/**
 * The to snapshot type of a model.
 *
 * @deprecated Use SnapshotOutOf<Model> instead.
 */
export type ModelToSnapshot<M extends AnyModel> = IsNeverType<
  M[typeof toSnapshotOverrideTypeSymbol],
  ModelPropsToSnapshotData<ModelPropsOf<M>>,
  M[typeof toSnapshotOverrideTypeSymbol]
> & { [modelTypeKey]?: string }

/**
 * Tricks TypeScript into accepting a particular kind of generic class as a parameter for `ExtendedModel`.
 * Does nothing in runtime.
 *
 * @typeparam T Generic model class type.
 * @param type Generic model class.
 * @returns
 */
export function modelClass<T extends AnyModel | AnyDataModel>(type: {
  prototype: T
}): ModelClass<T> {
  return type as any
}
