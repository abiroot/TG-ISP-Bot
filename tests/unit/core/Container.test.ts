/**
 * DI Container Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { Container, ServiceTokens } from '~/core/Container'

describe('DI Container', () => {
    let container: Container

    beforeEach(() => {
        container = new Container()
    })

    describe('Service Registration', () => {
        it('should register and resolve a service', () => {
            const service = { name: 'TestService' }
            container.registerSingleton('testService', service)

            const resolved = container.resolve('testService')
            expect(resolved).toBe(service)
        })

        it('should register a service with factory', () => {
            container.register('testService', () => ({ name: 'TestService' }))

            const resolved = container.resolve<{ name: string }>('testService')
            expect(resolved).toEqual({ name: 'TestService' })
        })

        it('should register a lazy singleton', () => {
            let callCount = 0
            container.registerLazySingleton('testService', () => {
                callCount++
                return { name: 'TestService', callCount }
            })

            const first = container.resolve('testService')
            const second = container.resolve('testService')

            expect(callCount).toBe(1) // Factory called only once
            expect(first).toBe(second) // Same instance returned
        })
    })

    describe('Service Resolution', () => {
        it('should throw error for non-existent service', () => {
            expect(() => container.resolve('nonExistent')).toThrow('Service not found')
        })

        it('should detect circular dependencies', () => {
            container.register('serviceA', (c) => {
                return { b: c.resolve('serviceB') }
            })

            container.register('serviceB', (c) => {
                return { a: c.resolve('serviceA') }
            })

            expect(() => container.resolve('serviceA')).toThrow('Circular dependency detected')
        })

        it('should resolve dependencies', () => {
            container.registerSingleton('logger', { log: vi.fn() })
            container.register('userService', (c) => {
                const logger = c.resolve('logger')
                return { logger, name: 'UserService' }
            })

            const service = container.resolve<any>('userService')
            expect(service.logger).toBeDefined()
            expect(service.name).toBe('UserService')
        })
    })

    describe('Service Lifecycle', () => {
        it('should create new instance for non-singleton', () => {
            let counter = 0
            container.register('testService', () => ({ id: ++counter }))

            const first = container.resolve<{ id: number }>('testService')
            const second = container.resolve<{ id: number }>('testService')

            expect(first.id).toBe(1)
            expect(second.id).toBe(2)
            expect(first).not.toBe(second)
        })

        it('should return same instance for singleton', () => {
            const service = { name: 'Singleton' }
            container.registerSingleton('testService', service)

            const first = container.resolve('testService')
            const second = container.resolve('testService')

            expect(first).toBe(second)
            expect(first).toBe(service)
        })
    })

    describe('Container Management', () => {
        it('should check if service is registered', () => {
            container.registerSingleton('testService', {})

            expect(container.has('testService')).toBe(true)
            expect(container.has('nonExistent')).toBe(false)
        })

        it('should get all registered services', () => {
            container.registerSingleton('service1', {})
            container.registerSingleton('service2', {})

            const services = container.getRegisteredServices()
            expect(services).toContain('service1')
            expect(services).toContain('service2')
            expect(services).toHaveLength(2)
        })

        it('should clear all services', () => {
            container.registerSingleton('service1', {})
            container.registerSingleton('service2', {})

            container.clear()

            expect(container.getRegisteredServices()).toHaveLength(0)
            expect(() => container.resolve('service1')).toThrow()
        })
    })

    describe('Child Containers', () => {
        it('should create child container with parent services', () => {
            container.registerSingleton('parentService', { name: 'Parent' })

            const child = container.createChild()
            const service = child.resolve<{ name: string }>('parentService')

            expect(service.name).toBe('Parent')
        })

        it('should allow child to override parent services', () => {
            container.registerSingleton('testService', { name: 'Parent' })

            const child = container.createChild()
            child.registerSingleton('testService', { name: 'Child' })

            const parentService = container.resolve<{ name: string }>('testService')
            const childService = child.resolve<{ name: string }>('testService')

            expect(parentService.name).toBe('Parent')
            expect(childService.name).toBe('Child')
        })
    })
})
