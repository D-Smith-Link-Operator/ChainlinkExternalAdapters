import objectPath from 'object-path'
import { Requester, Validator } from '@chainlink/external-adapter'

type JobSpecRequest = {
  id: string
  data: Record<string, unknown>
}
type Callback = (statusCode: number, data: Record<string, unknown>) => void

const inputParams = {
  reducer: true,
  initialValue: false,
  dataPath: false,
  valuePath: false,
}

const DEFAULT_DATA_PATH = 'result'

// Export function to integrate with Chainlink node
export const execute = (request: JobSpecRequest, callback: Callback): void => {
  const validator = new Validator(request, inputParams)
  if (validator.error) return callback(validator.error.statusCode, validator.error)

  const jobRunID = validator.validated.id

  const _handleResponse = (out: unknown): void => {
    callback(
      200,
      Requester.success(jobRunID, {
        data: { result: out },
        result: out,
        status: 200,
      }),
    )
  }

  const _handleError = (err: Error): void => callback(500, Requester.errored(jobRunID, err.message))

  const { data } = validator.validated

  const dataPath = data.dataPath || DEFAULT_DATA_PATH
  let inputData = <number[]>objectPath.get(request.data, dataPath)

  // Check if input data is valid
  if (!inputData || !Array.isArray(inputData) || inputData.length === 0) {
    _handleError(Error(`Input must be a non-empty array.`))
    return
  }

  const path = data.valuePath || ''
  // Check if every input object has a path specified
  if (path && !inputData.every((val) => objectPath.has(val, path))) {
    _handleError(Error(`Path '${path}' not present in every item.`))
    return
  }

  // Get value at specified path
  const _get = (val: unknown): number => objectPath.get(val, path)

  // Filter undesired values
  inputData = inputData.filter((val) => !!_get(val))

  // Check if all items are numbers
  const _isNumber = (val: unknown): boolean => !isNaN(_get(val))
  if (!inputData.every(_isNumber)) {
    _handleError(Error(`Not every '${path}' item is a number.`))
    return
  }

  let result
  switch (data.reducer) {
    case 'sum': {
      result = inputData.reduce((acc, val) => acc + _get(val), data.initialValue || 0)
      break
    }
    case 'product': {
      result = inputData.reduce((acc, val) => acc * _get(val), data.initialValue || 1)
      break
    }
    case 'average': {
      result = inputData.reduce(
        (acc, val, _, { length }) => acc + _get(val) / length,
        data.initialValue || 0,
      )
      break
    }
    case 'median': {
      const sortedData = inputData.sort((a, b) => _get(a) - _get(b))
      const mid = Math.ceil(inputData.length / 2)
      result =
        inputData.length % 2 === 0
          ? (sortedData[mid] + sortedData[mid - 1]) / 2
          : sortedData[mid - 1]
      break
    }
    case 'min': {
      result = inputData.reduce(
        (acc, val) => Math.min(acc, _get(val)),
        data.initialValue || Number.MAX_VALUE,
      )
      break
    }
    case 'max': {
      result = inputData.reduce(
        (acc, val) => Math.max(acc, _get(val)),
        data.initialValue || Number.MIN_VALUE,
      )
      break
    }
    default: {
      _handleError(Error(`Reducer ${data.reducer} not supported.`))
      return
    }
  }

  _handleResponse(result)
}
