import { fastGetParentIncludingDataObjects } from "../parent/path"
import type { Path } from "../parent/pathTypes"
import { isTweakedObject } from "../tweaker/core"
import { isArray, isObject, isPrimitive, lazy } from "../utils"
import { getOrCreate } from "../utils/mapUtils"
import type { AnyStandardType } from "./schemas"
import { TypeCheckError } from "./TypeCheckError"

type CheckFunction = (value: any, path: Path) => TypeCheckError | null

const emptyPath: Path = []

type CheckResult = TypeCheckError | null
type CheckResultCache = WeakMap<object, CheckResult>

const typeCheckersWithCachedResultsOfObject = new WeakMap<object, Set<TypeChecker>>()

/**
 * @internal
 */
export enum TypeCheckerBaseType {
  Object = "object",
  Array = "array",
  Primitive = "primitive",
  Any = "any",
}

/**
 * @internal
 */
export function getTypeCheckerBaseTypeFromValue(value: any): TypeCheckerBaseType {
  // array must be before object since arrays are also objects
  if (isArray(value)) return TypeCheckerBaseType.Array
  if (isObject(value)) return TypeCheckerBaseType.Object
  if (isPrimitive(value)) return TypeCheckerBaseType.Primitive
  return TypeCheckerBaseType.Any
}

/**
 * @internal
 */
export function invalidateCachedTypeCheckerResult(obj: object) {
  // we need to invalidate it for the object and all its parents
  let current: any = obj
  while (current) {
    const set = typeCheckersWithCachedResultsOfObject.get(current)
    if (set) {
      for (const typeChecker of set) {
        typeChecker.invalidateCachedResult(current)
      }
      typeCheckersWithCachedResultsOfObject.delete(current)
    }

    current = fastGetParentIncludingDataObjects(current)
  }
}

const typeCheckersWithCachedSnapshotProcessorResultsOfObject = new WeakMap<
  object,
  Set<TypeChecker>
>()

/**
 * @internal
 */
export function invalidateCachedToSnapshotProcessorResult(obj: object) {
  const set = typeCheckersWithCachedSnapshotProcessorResultsOfObject.get(obj)

  if (set) {
    set.forEach((typeChecker) => typeChecker.invalidateSnapshotProcessorCachedResult(obj))
    typeCheckersWithCachedSnapshotProcessorResultsOfObject.delete(obj)
  }
}

/**
 * @internal
 */
export class TypeChecker {
  private checkResultCache?: CheckResultCache

  unchecked: boolean

  private createCacheIfNeeded(): CheckResultCache {
    if (!this.checkResultCache) {
      this.checkResultCache = new WeakMap()
    }
    return this.checkResultCache
  }

  setCachedResult(obj: object, newCacheValue: CheckResult) {
    this.createCacheIfNeeded().set(obj, newCacheValue)

    // register this type checker as listener of that object changes
    const typeCheckerSet = getOrCreate(typeCheckersWithCachedResultsOfObject, obj, () => new Set())

    typeCheckerSet.add(this)
  }

  invalidateCachedResult(obj: object) {
    this.checkResultCache?.delete(obj)
  }

  private getCachedResult(obj: object): CheckResult | undefined {
    return this.checkResultCache?.get(obj)
  }

  check(value: any, path: Path): TypeCheckError | null {
    if (this.unchecked) {
      return null
    }

    if (!isTweakedObject(value, true)) {
      return this._check!(value, path)
    }

    // optimized checking with cached values

    let cachedResult = this.getCachedResult(value)

    if (cachedResult === undefined) {
      // we set the path empty since the result could be used for paths other than this base
      cachedResult = this._check!(value, emptyPath)
      this.setCachedResult(value, cachedResult)
    }

    if (cachedResult) {
      return new TypeCheckError(
        [...path, ...cachedResult.path],
        cachedResult.expectedTypeName,
        cachedResult.actualValue
      )
    } else {
      return null
    }
  }

  private _cachedTypeInfoGen: TypeInfoGen

  get typeInfo() {
    return this._cachedTypeInfoGen(this as any)
  }

  constructor(
    readonly baseType: TypeCheckerBaseType,
    private readonly _check: CheckFunction | null,
    readonly getTypeName: (...recursiveTypeCheckers: TypeChecker[]) => string,
    readonly typeInfoGen: TypeInfoGen,
    readonly snapshotType: (sn: unknown) => TypeChecker | null,
    private readonly _fromSnapshotProcessor: (sn: any) => unknown,
    private readonly _toSnapshotProcessor: (sn: any) => unknown
  ) {
    this.unchecked = !_check
    this._cachedTypeInfoGen = lazy(typeInfoGen)
  }

  fromSnapshotProcessor = (sn: any): unknown => {
    // we cannot cache fromSnapshotProcessor since nobody ensures us
    // the original snapshot won't be tweaked after use
    return this._fromSnapshotProcessor(sn)
  }

  private readonly _toSnapshotProcessorCache = new WeakMap<object, unknown>()

  invalidateSnapshotProcessorCachedResult(obj: object) {
    this._toSnapshotProcessorCache.delete(obj)
  }

  toSnapshotProcessor = (sn: any): unknown => {
    if (typeof sn !== "object" || sn === null) {
      // not cacheable
      return this._toSnapshotProcessor(sn)
    }

    if (this._toSnapshotProcessorCache.has(sn)) {
      return this._toSnapshotProcessorCache.get(sn)
    }

    const val = this._toSnapshotProcessor(sn)
    this._toSnapshotProcessorCache.set(sn, val)

    // register this type checker as listener of that sn changes
    const typeCheckerSet = getOrCreate(
      typeCheckersWithCachedSnapshotProcessorResultsOfObject,
      sn,
      () => new Set()
    )

    typeCheckerSet.add(this)

    return val
  }
}

const lateTypeCheckerSymbol = Symbol("lateTypeCheker")

/**
 * @internal
 */
export interface LateTypeChecker {
  [lateTypeCheckerSymbol]: true
  (): TypeChecker
  typeInfo: TypeInfo
}

/**
 * @internal
 */
export function lateTypeChecker(fn: () => TypeChecker, typeInfoGen: TypeInfoGen): LateTypeChecker {
  let cached: TypeChecker | undefined
  const ltc = function () {
    if (cached) {
      return cached
    }

    cached = fn()
    return cached
  }
  ;(ltc as LateTypeChecker)[lateTypeCheckerSymbol] = true

  const cachedTypeInfoGen = lazy(typeInfoGen)

  Object.defineProperty(ltc, "typeInfo", {
    enumerable: true,
    configurable: true,
    get() {
      return cachedTypeInfoGen(ltc as any)
    },
  })

  return ltc as LateTypeChecker
}

/**
 * @internal
 */
export function isLateTypeChecker(ltc: unknown): ltc is LateTypeChecker {
  return typeof ltc === "function" && lateTypeCheckerSymbol in ltc
}

/**
 * Type info base class.
 */
export class TypeInfo {
  constructor(readonly thisType: AnyStandardType) {}
}

/**
 * @internal
 */
export type TypeInfoGen = (t: AnyStandardType) => TypeInfo
