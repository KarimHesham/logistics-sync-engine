import {
  ClassConstructor,
  ClassTransformOptions,
  plainToInstance,
} from 'class-transformer';

export function Mapper<T, V>(
  cls: ClassConstructor<T>,
  plain: V,
  options?: ClassTransformOptions,
): T {
  return plainToInstance(cls, plain, {
    excludeExtraneousValues: true,
    ...options,
  });
}

export function ListMapper<T, V>(
  cls: ClassConstructor<T>,
  plain: V[],
  options?: ClassTransformOptions,
): T[] {
  return plain.map((item) => Mapper(cls, item, options));
}
