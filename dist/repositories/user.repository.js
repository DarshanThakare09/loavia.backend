"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserRepository = void 0;
const prisma_1 = require("../config/prisma");
class UserRepository {
    async create(data) {
        return prisma_1.prisma.user.create({ data });
    }
    async findByEmail(email) {
        return prisma_1.prisma.user.findUnique({
            where: { email },
        });
    }
    async findById(id) {
        return prisma_1.prisma.user.findUnique({
            where: { id },
        });
    }
    async update(id, data) {
        return prisma_1.prisma.user.update({
            where: { id },
            data,
        });
    }
    async incrementTokenVersion(id) {
        return prisma_1.prisma.user.update({
            where: { id },
            data: {
                tokenVersion: {
                    increment: 1,
                },
            },
        });
    }
}
exports.UserRepository = UserRepository;
