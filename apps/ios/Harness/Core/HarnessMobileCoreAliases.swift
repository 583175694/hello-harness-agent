#if CORE_PORT
import HarnessMobileCore

/// KMP Obj-C export 使用 `Core_api*` Swift 名；Port 层保持与 Android API 模型一致的短名。
typealias MobileActiveSessionSnapshot = Core_apiMobileActiveSessionSnapshot
typealias ConnectionState = Core_apiConnectionState
typealias ProblemDetails = Core_apiProblemDetails
typealias MobileWorkbenchSnapshot = Core_apiMobileWorkbenchSnapshot
typealias MobileWorkbenchToolExecution = Core_apiMobileWorkbenchToolExecution
typealias MobileWorkbenchSource = Core_apiMobileWorkbenchSource
typealias MobileWorkbenchActivityEvent = Core_apiMobileWorkbenchActivityEvent

#endif
