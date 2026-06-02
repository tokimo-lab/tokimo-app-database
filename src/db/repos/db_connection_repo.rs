use sea_orm::{ActiveModelTrait, ColumnTrait, ConnectionTrait, EntityTrait, QueryFilter, Set, sea_query::Expr};
use uuid::Uuid;

use crate::db::entities::db_connections;
use crate::handlers::AppError;

/// Input for creating or updating a database connection record.
#[derive(Debug)]
pub struct DbConnectionInput {
    pub driver: String,
    pub name: String,
    pub host: String,
    pub port: Option<i32>,
    pub username: Option<String>,
    pub password: Option<String>,
    pub database: Option<String>,
    pub params: Option<String>,
}

pub struct DbConnectionRepo;

impl DbConnectionRepo {
    pub async fn list_all<C: ConnectionTrait>(db: &C) -> Result<Vec<db_connections::Model>, AppError> {
        let rows = db_connections::Entity::find().all(db).await?;
        Ok(rows)
    }

    pub async fn get_by_id<C: ConnectionTrait>(db: &C, id: Uuid) -> Result<db_connections::Model, AppError> {
        db_connections::Entity::find_by_id(id)
            .one(db)
            .await?
            .ok_or_else(|| AppError::NotFound("DB connection not found".into()))
    }

    pub async fn create<C: ConnectionTrait>(db: &C, input: DbConnectionInput) -> Result<db_connections::Model, AppError> {
        let now = chrono::Utc::now().fixed_offset();
        let model = db_connections::ActiveModel {
            id: Set(Uuid::new_v4()),
            driver: Set(input.driver),
            name: Set(input.name),
            host: Set(input.host),
            port: Set(input.port),
            username: Set(input.username),
            password: Set(input.password),
            database: Set(input.database),
            params: Set(input.params),
            created_at: Set(now),
            updated_at: Set(now),
        };
        let result = model.insert(db).await?;
        Ok(result)
    }

    pub async fn update<C: ConnectionTrait>(
        db: &C,
        id: Uuid,
        input: DbConnectionInput,
    ) -> Result<db_connections::Model, AppError> {
        let now = chrono::Utc::now().fixed_offset();
        let mut results = db_connections::Entity::update_many()
            .filter(db_connections::Column::Id.eq(id))
            .col_expr(db_connections::Column::Driver, Expr::value(input.driver))
            .col_expr(db_connections::Column::Name, Expr::value(input.name))
            .col_expr(db_connections::Column::Host, Expr::value(input.host))
            .col_expr(db_connections::Column::Port, Expr::value(input.port))
            .col_expr(db_connections::Column::Username, Expr::value(input.username))
            .col_expr(db_connections::Column::Password, Expr::value(input.password))
            .col_expr(db_connections::Column::Database, Expr::value(input.database))
            .col_expr(db_connections::Column::Params, Expr::value(input.params))
            .col_expr(db_connections::Column::UpdatedAt, Expr::value(now))
            .exec_with_returning(db)
            .await?;
        results
            .into_iter()
            .next()
            .ok_or_else(|| AppError::NotFound("DB connection not found".into()))
    }

    pub async fn delete<C: ConnectionTrait>(db: &C, id: Uuid) -> Result<(), AppError> {
        db_connections::Entity::delete_by_id(id).exec(db).await?;
        Ok(())
    }
}
