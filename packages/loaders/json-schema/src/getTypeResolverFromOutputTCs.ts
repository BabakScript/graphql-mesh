import { GraphQLObjectType, GraphQLResolveInfo, GraphQLTypeResolver } from 'graphql';
import { createGraphQLError, getDirective } from '@graphql-tools/utils';

export function getTypeResolverFromOutputTCs({
  possibleTypes,
  discriminatorField,
  discriminatorMapping,
  statusCodeTypeNameMap,
}: {
  possibleTypes: readonly GraphQLObjectType[];
  discriminatorField?: string;
  discriminatorMapping?: Record<string, string>;
  statusCodeTypeNameMap?: Record<string, string>;
}): GraphQLTypeResolver<any, any> {
  return function resolveType(data: any, _ctx: any, info: GraphQLResolveInfo) {
    if (data.__typename) {
      return data.__typename;
    } else if (discriminatorField != null && data[discriminatorField]) {
      const discriminatorValue = data[discriminatorField];
      return discriminatorMapping?.[discriminatorValue] || discriminatorValue;
    }
    if (data.$statusCode && statusCodeTypeNameMap) {
      const typeName =
        statusCodeTypeNameMap[data.$statusCode.toString()] || statusCodeTypeNameMap.default;
      if (typeName) {
        return typeName;
      }
    }

    const dataTypeOf = typeof data;

    if (dataTypeOf !== 'object') {
      for (const possibleType of possibleTypes) {
        const fieldMap = possibleType.getFields();
        const fields = Object.values(fieldMap);
        if (fields.length === 1) {
          const field = fields[0];
          const directiveObjs = getDirective(info.schema, field, 'resolveRoot');
          if (directiveObjs?.length) {
            const fieldType = field.type;
            if ('parseValue' in fieldType) {
              try {
                fieldType.parseValue(data);
                return possibleType.name;
              } catch (e) {}
            }
          }
        }
      }
    }

    // const validationErrors: Record<string, ErrorObject[]> = {};
    const dataKeys = dataTypeOf
      ? Object.keys(data)
          // Remove metadata fields used to pass data
          .filter(property => !property.toString().startsWith('$'))
      : null;
    for (const possibleType of possibleTypes) {
      const typeName = possibleType.name;
      if (dataKeys != null) {
        const typeFields = Object.keys(possibleType.getFields());
        if (
          dataKeys.length <= typeFields.length &&
          dataKeys.every(property => typeFields.includes(property.toString()))
        ) {
          return typeName;
        }
      } /* else {
        const validateFn = possibleType.extensions.validateWithJSONSchema as ValidateFunction;
        if (validateFn) {
          const isValid = validateFn(data);
          if (isValid) {
            return typeName;
          }
          validationErrors[typeName] = ajv.errors || validateFn.errors;
        }
      } */
    }
    if (data.$response) {
      const error = createGraphQLError(`HTTP Error: ${data.$statusCode}`, {
        extensions: {
          http: {
            status: data.$statusCode,
            headers: data.$response.header,
          },
          request: {
            url: data.$url,
            method: data.$method,
          },
          responseJson: data.$response,
        },
      });
      return error;
    }
    /*
    const error = new GraphQLError(`Received data doesn't met the union`, null, null, null, null, null, {
      validationErrors,
    });
    return error;
    */
  };
}
