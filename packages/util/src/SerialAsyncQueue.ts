export class SerialAsyncQueue {
  _lastPromise: Promise<any>
  constructor() {
    this._lastPromise = Promise.resolve(); // 初始化累积 Promise
  }
  call(asyncTask: (...args: any[]) => Promise<any>) {
    // 为队列中的上一个 Promise 添加一个新的完成后的回调，
    // 并用任务的 Promise 替换掉当前累积的 Promise
    this._lastPromise = this._lastPromise.then(asyncTask, asyncTask)
    return this._lastPromise; // 返回最新的 Promise，以便链式调用或捕获错误
  }
}