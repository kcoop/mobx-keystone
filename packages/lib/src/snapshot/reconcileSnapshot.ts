import { set } from "mobx"
import { modelIdKey, modelTypeKey } from "../model/metadata"
import { isModel } from "../model/utils"
import { fastGetParentPathIncludingDataObjects } from "../parent"
import { failure, isMap, isPrimitive, isSet } from "../utils"
import type { ModelPool } from "../utils/ModelPool"
import { getSnapshot } from "./getSnapshot"
import { registerDefaultReconcilers } from "./registerDefaultReconcilers"

type Reconciler = (value: any, sn: any, modelPool: ModelPool, parent: any) => any | undefined

const reconcilers: { priority: number; reconciler: Reconciler }[] = []

/**
 * @internal
 */
export function registerReconciler(priority: number, reconciler: Reconciler): void {
  reconcilers.push({ priority, reconciler })
  reconcilers.sort((a, b) => a.priority - b.priority)
}

/**
 * @internal
 */
export function reconcileSnapshot(value: any, sn: any, modelPool: ModelPool, parent: any): any {
  if (isPrimitive(sn)) {
    return sn
  }

  // if the snapshot passed is exactly the same as the current one
  // then it is already reconciled
  if (getSnapshot(value) === sn) {
    return value
  }

  registerDefaultReconcilers()

  const reconcilersLen = reconcilers.length
  for (let i = 0; i < reconcilersLen; i++) {
    const { reconciler } = reconcilers[i]
    const ret = reconciler(value, sn, modelPool, parent)
    if (ret !== undefined) {
      return ret
    }
  }

  if (isMap(sn)) {
    throw failure("a snapshot must not contain maps")
  }

  if (isSet(sn)) {
    throw failure("a snapshot must not contain sets")
  }

  throw failure(`unsupported snapshot - ${sn}`)
}

/**
 * @internal
 */
export function detachIfNeeded(newValue: any, oldValue: any, modelPool: ModelPool) {
  // edge case for when we are swapping models around the tree

  if (newValue === oldValue) {
    // already where it should be
    return
  }

  if (
    isModel(newValue) &&
    modelPool.findModelByTypeAndId(newValue[modelTypeKey], newValue[modelIdKey])
  ) {
    const parentPath = fastGetParentPathIncludingDataObjects(newValue)
    if (parentPath) {
      set(parentPath.parent, parentPath.path, null)
    }
  }
}
